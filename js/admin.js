// ============================================================
//  admin.js  —  Admin panel logic
//  Handles: password gate, stats, shuffle trigger, pair view
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM refs ---
const passwordGate  = document.getElementById('password-gate');
const adminPanel    = document.getElementById('admin-panel');
const pwInput       = document.getElementById('admin-password');
const pwBtn         = document.getElementById('pw-btn');
const pwAlert       = document.getElementById('pw-alert');

const shuffleBtn    = document.getElementById('shuffle-btn');
const shuffleAlert  = document.getElementById('shuffle-alert');
const resetBtn      = document.getElementById('reset-btn');

const statTotal     = document.getElementById('stat-total');
const statCloud     = document.getElementById('stat-cloud');
const statNetwork   = document.getElementById('stat-network');
const statComputing = document.getElementById('stat-computing');
const statAI        = document.getElementById('stat-ai');
const statPaired    = document.getElementById('stat-paired');

const downloadPdfBtn = document.getElementById('download-pdf-btn');

const pairsSection  = document.getElementById('pairs-section');
const pairsContainer = document.getElementById('pairs-container');
const participantsContainer = document.getElementById('participants-container');

// ============================================================
//  Password gate
// ============================================================
function checkPassword() {
  if (pwInput.value.trim() === ADMIN_PASSWORD) {
    passwordGate.style.display = 'none';
    adminPanel.style.display   = 'block';
    loadDashboard();
  } else {
    pwAlert.style.display = 'flex';
    pwAlert.className = 'alert alert-error';
    pwAlert.textContent = '❌ Incorrect password. Try again.';
    pwInput.value = '';
    pwInput.focus();
  }
}

pwBtn.addEventListener('click', checkPassword);
pwInput.addEventListener('keyup', e => { if (e.key === 'Enter') checkPassword(); });

// ============================================================
//  Cryptographically fair Fisher-Yates shuffle
// ============================================================
function fairShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    // Use rejection sampling to avoid modulo bias
    const max = Math.floor(0xFFFFFFFF / (i + 1)) * (i + 1);
    let rand;
    do {
      crypto.getRandomValues(buf);
      rand = buf[0];
    } while (rand >= max);
    const j = rand % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================================
//  Pair participants within each track
//  - Only pairs unassigned (partner_id === null) members
//  - If 1 unassigned leftover: joins an existing pair to make a trio
// ============================================================
function buildIncrementalPairs(allParticipants) {
  const byTrack = {};
  for (const p of allParticipants) {
    if (!byTrack[p.track]) byTrack[p.track] = [];
    byTrack[p.track].push(p);
  }

  const updates = []; // { id, partner_id }

  for (const [track, members] of Object.entries(byTrack)) {
    const unassigned = members.filter(p => !p.partner_id);
    const assigned = members.filter(p => !!p.partner_id);

    if (unassigned.length === 0) continue;

    // Fair shuffle only the unassigned members
    const shuffled = fairShuffle(unassigned);

    if (shuffled.length === 1) {
      // Exactly 1 new person in this track: connect them with an already paired member (trio)
      if (assigned.length > 0) {
        const target = assigned[0];
        updates.push({ id: shuffled[0].id, partner_id: target.id });
      }
      continue;
    }

    let i = 0;
    while (i < shuffled.length) {
      if (i + 1 < shuffled.length) {
        const a = shuffled[i];
        const b = shuffled[i + 1];

        // If 3 left at the end
        if (i + 2 === shuffled.length - 1) {
          const c = shuffled[i + 2];
          updates.push({ id: a.id, partner_id: b.id });
          updates.push({ id: b.id, partner_id: a.id });
          updates.push({ id: c.id, partner_id: a.id });
          i += 3;
        } else {
          updates.push({ id: a.id, partner_id: b.id });
          updates.push({ id: b.id, partner_id: a.id });
          i += 2;
        }
      } else {
        // Lone remainder from odd unassigned list: connect to an existing paired or newly paired
        const loner = shuffled[i];
        if (updates.length > 0) {
          updates.push({ id: loner.id, partner_id: updates[0].id });
        } else if (assigned.length > 0) {
          updates.push({ id: loner.id, partner_id: assigned[0].id });
        }
        i++;
      }
    }
  }

  return updates;
}

// ============================================================
//  Run shuffle
// ============================================================
async function runShuffle() {
  const confirmed = window.confirm(
    '🔀 Run the accountability shuffle?\n\nThis will pair all NEW unregistered participants. Anyone who already has a partner will KEEP their current partner.'
  );
  if (!confirmed) return;

  shuffleBtn.disabled = true;
  shuffleBtn.innerHTML = '<span class="spinner"></span> Shuffling…';
  shuffleAlert.style.display = 'none';

  try {
    // Load all participants
    const { data: participants, error } = await supabase
      .from('participants')
      .select('*');

    if (error) throw error;

    const unassigned = (participants || []).filter(p => !p.partner_id);

    if (unassigned.length === 0) {
      showShuffleAlert('All registered participants are already paired!', 'alert-info');
      shuffleBtn.disabled = false;
      shuffleBtn.textContent = '🔀 Shuffle New Participants';
      return;
    }

    // Build pairs only for unassigned
    const updates = buildIncrementalPairs(participants);

    if (updates.length === 0) {
      showShuffleAlert('Not enough new participants in any track to form new pairs (need at least 2, or 1 paired member to join).', 'alert-info');
      shuffleBtn.disabled = false;
      shuffleBtn.textContent = '🔀 Shuffle New Participants';
      return;
    }

    // Apply updates in batch
    for (const upd of updates) {
      const { error: updErr } = await supabase
        .from('participants')
        .update({ partner_id: upd.partner_id })
        .eq('id', upd.id);

      if (updErr) throw updErr;
    }

    // Mark shuffle as done / update timestamp
    const { error: stateErr } = await supabase
      .from('shuffle_state')
      .upsert([{ id: 1, shuffled: true, shuffled_at: new Date().toISOString() }]);

    if (stateErr) throw stateErr;

    showShuffleAlert(`✅ Shuffle complete! Paired ${updates.length} new participant(s). Existing pairs remained unchanged.`, 'alert-success');
    await loadDashboard();

  } catch (err) {
    console.error(err);
    showShuffleAlert('❌ Shuffle failed: ' + err.message, 'alert-error');
    shuffleBtn.disabled = false;
    shuffleBtn.textContent = '🔀 Shuffle New Participants';
  }
}

// ============================================================
//  Reset (dangerous)
// ============================================================
async function runReset() {
  const confirmed = window.confirm(
    '🚨 RESET ALL DATA?\n\nThis will delete ALL participants and reset the shuffle. This cannot be undone.\n\nType the admin password again to confirm.'
  );
  if (!confirmed) return;

  const pw = window.prompt('Enter admin password to confirm reset:');
  if (pw !== ADMIN_PASSWORD) {
    alert('Incorrect password. Reset cancelled.');
    return;
  }

  resetBtn.disabled = true;
  resetBtn.textContent = 'Resetting…';

  try {
    await supabase.from('participants').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('shuffle_state').upsert([{ id: 1, shuffled: false, shuffled_at: null }]);
    alert('✅ Reset complete. All data cleared.');
    await loadDashboard();
  } catch (err) {
    console.error(err);
    alert('Reset failed: ' + err.message);
  }

  resetBtn.disabled = false;
  resetBtn.textContent = '🗑 Reset All Data';
}

// ============================================================
//  Load dashboard
// ============================================================
async function loadDashboard() {
  const { data: participants } = await supabase
    .from('participants')
    .select('*')
    .order('track', { ascending: true })
    .order('number', { ascending: true });

  const { data: state } = await supabase
    .from('shuffle_state')
    .select('*')
    .eq('id', 1)
    .single();

  const all = participants || [];
  const paired = all.filter(p => p.partner_id !== null);

  // Update stats
  statTotal.textContent     = all.length;
  statCloud.textContent     = all.filter(p => p.track === 'Cloud').length;
  statNetwork.textContent   = all.filter(p => p.track === 'Network').length;
  statComputing.textContent = all.filter(p => p.track === 'Computing').length;
  statAI.textContent        = all.filter(p => p.track === 'AI').length;
  statPaired.textContent    = paired.length;

  // Shuffle button state
  const unassigned = all.filter(p => !p.partner_id);

  if (unassigned.length === 0 && all.length > 0) {
    shuffleBtn.disabled = true;
    shuffleBtn.textContent = '✅ All Participants Paired';
    if (state?.shuffled_at) {
      showShuffleAlert(`All current participants have partners. Last shuffle: ${new Date(state.shuffled_at).toLocaleString()}`, 'alert-success');
    }
  } else if (unassigned.length > 0) {
    shuffleBtn.disabled = false;
    shuffleBtn.textContent = `🔀 Pair ${unassigned.length} New Participant${unassigned.length > 1 ? 's' : ''}`;
    showShuffleAlert(`There are <strong>${unassigned.length}</strong> new participant(s) waiting for an accountability partner. Click to pair them!`, 'alert-info');
  } else {
    shuffleBtn.disabled = true;
    shuffleBtn.textContent = '🔀 Pair New Participants';
    showShuffleAlert('No participants registered yet.', 'alert-info');
  }

  // Participants table
  renderParticipantsTable(all, participants || []);

  // Pairs view
  if (state?.shuffled && all.length > 0) {
    pairsSection.style.display = 'block';
    renderPairs(all);
  } else {
    pairsSection.style.display = 'none';
  }
}

function renderParticipantsTable(all, fullList) {
  if (all.length === 0) {
    participantsContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px">No participants registered yet.</p>';
    return;
  }

  const rows = all.map(p => `
    <tr>
      <td>${p.number}</td>
      <td>${escapeHtml(p.name)}</td>
      <td><span class="track-pill track-${p.track}">${p.track}</span></td>
      <td>${p.partner_id ? '✅ Paired' : '<span style="color:var(--text-muted)">Pending</span>'}</td>
      <td style="color:var(--text-muted);font-size:12px">${new Date(p.created_at).toLocaleString()}</td>
    </tr>
  `).join('');

  participantsContainer.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Track</th>
            <th>Status</th>
            <th>Registered</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderPairs(all) {
  const byTrack = {};
  for (const p of all) {
    if (!byTrack[p.track]) byTrack[p.track] = [];
    byTrack[p.track].push(p);
  }

  const lookup = {};
  all.forEach(p => { lookup[p.id] = p; });

  let html = '';
  const seen = new Set();

  for (const [track, members] of Object.entries(byTrack)) {
    html += `
      <div class="track-section">
        <div class="track-header">
          <span class="track-pill track-${track}">${track}</span>
          <span style="color:var(--text-muted);font-size:13px">${members.length} participant${members.length !== 1 ? 's' : ''}</span>
        </div>
    `;

    let pairNum = 1;
    for (const p of members) {
      if (seen.has(p.id)) continue;

      const partner = p.partner_id ? lookup[p.partner_id] : null;
      seen.add(p.id);
      if (partner) seen.add(partner.id);

      html += `
        <div class="card" style="margin-bottom:12px;padding:20px">
          <div style="font-size:11px;color:var(--text-muted);font-weight:700;letter-spacing:1px;margin-bottom:12px">
            PAIR ${pairNum++}
          </div>
          <div class="partner-info">
            <div class="partner-avatar" style="width:40px;height:40px;font-size:15px">${getInitials(p.name)}</div>
            <div class="partner-details">
              <div class="partner-name" style="font-size:16px">${escapeHtml(p.name)}</div>
              <div class="partner-num">#${p.number}</div>
            </div>
          </div>
          ${partner ? `
          <div class="connector-line" style="margin:10px 0">🤝</div>
          <div class="partner-info">
            <div class="partner-avatar" style="width:40px;height:40px;font-size:15px">${getInitials(partner.name)}</div>
            <div class="partner-details">
              <div class="partner-name" style="font-size:16px">${escapeHtml(partner.name)}</div>
              <div class="partner-num">#${partner.number}</div>
            </div>
          </div>
          ` : '<div class="alert alert-info" style="display:flex;margin-top:8px">Solo participant — no partner (contact admin)</div>'}
        </div>
      `;
    }

    html += '</div>';
  }

  pairsContainer.innerHTML = html;
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showShuffleAlert(msg, type) {
  shuffleAlert.className = `alert ${type}`;
  shuffleAlert.innerHTML = msg;
  shuffleAlert.style.display = 'flex';
}

// ============================================================
//  Download PDF Report
// ============================================================
async function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const { data: participants } = await supabase
    .from('participants')
    .select('*')
    .order('track', { ascending: true })
    .order('number', { ascending: true });

  const all = participants || [];
  const lookup = {};
  all.forEach(p => { lookup[p.id] = p; });

  const byTrack = {};
  for (const p of all) {
    if (!byTrack[p.track]) byTrack[p.track] = [];
    byTrack[p.track].push(p);
  }

  // Header Title
  doc.setFillColor(207, 10, 44); // Huawei Red
  doc.rect(0, 0, 210, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Huawei ICT Academy - Accountability Pairs', 14, 15);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 21);

  let currentY = 32;

  for (const [track, members] of Object.entries(byTrack)) {
    const tableData = [];
    const seen = new Set();
    let pairIndex = 1;

    for (const p of members) {
      if (seen.has(p.id)) continue;
      const partner = p.partner_id ? lookup[p.partner_id] : null;
      seen.add(p.id);
      if (partner) seen.add(partner.id);

      tableData.push([
        `Pair ${pairIndex++}`,
        `${p.name} (#${p.number})`,
        partner ? `${partner.name} (#${partner.number})` : 'Awaiting Partner'
      ]);
    }

    if (tableData.length === 0) continue;

    // Check page overflow
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }

    doc.setTextColor(26, 26, 26);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${track.toUpperCase()} TRACK (${members.length} participants)`, 14, currentY);
    currentY += 4;

    doc.autoTable({
      startY: currentY,
      head: [['#', 'Student 1', 'Student 2 (Partner)']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [207, 10, 44],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 10,
        cellPadding: 4
      },
      margin: { left: 14, right: 14 }
    });

    currentY = doc.lastAutoTable.finalY + 12;
  }

  doc.save(`Huawei_ICT_Accountability_Pairs_${new Date().toISOString().slice(0,10)}.pdf`);
}

// ============================================================
//  Event listeners
// ============================================================
shuffleBtn.addEventListener('click', runShuffle);
resetBtn.addEventListener('click', runReset);
if (downloadPdfBtn) downloadPdfBtn.addEventListener('click', generatePDF);

// Real-time updates
supabase
  .channel('admin-participants')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, loadDashboard)
  .subscribe();

