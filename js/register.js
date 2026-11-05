// ============================================================
//  register.js  —  Registration page logic
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form        = document.getElementById('register-form');
const nameInput   = document.getElementById('name');
const trackSelect = document.getElementById('track');
const submitBtn   = document.getElementById('submit-btn');
const alertBox    = document.getElementById('alert-box');
const resultBox   = document.getElementById('result-box');

// Live participant count per track
async function loadCounts() {
  const { data, error } = await supabase
    .from('participants')
    .select('track');

  if (error || !data) return;

  const counts = { Cloud: 0, Network: 0, Computing: 0, AI: 0 };
  data.forEach(r => { if (counts[r.track] !== undefined) counts[r.track]++; });

  for (const [track, count] of Object.entries(counts)) {
    const el = document.getElementById(`count-${track}`);
    if (el) el.textContent = `${count}`;
  }
}

// Cryptographically fair Fisher-Yates shuffle
// (used only for display preview; actual pairing done in admin.js)
function fairShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showAlert(msg, type = 'error') {
  alertBox.className = `alert alert-${type}`;
  alertBox.innerHTML = msg;
  alertBox.style.display = 'flex';
}

function hideAlert() {
  alertBox.style.display = 'none';
}

async function register(e) {
  e.preventDefault();
  hideAlert();

  const name  = nameInput.value.trim();
  const track = trackSelect.value;

  if (!name) return showAlert('Please enter your full name.');
  if (!track) return showAlert('Please select your track.');

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Registering…';

  try {
    // Check if name already registered (case-insensitive)
    const { data: existing } = await supabase
      .from('participants')
      .select('id, name, number, track')
      .ilike('name', name);

    if (existing && existing.length > 0) {
      const dup = existing[0];
      showAlert(
        `✋ It looks like <strong>${dup.name}</strong> is already registered in the ${dup.track} track as <strong>#${dup.number}</strong>.<br>If this is a mistake, contact your admin.`,
        'error'
      );
      submitBtn.disabled = false;
      submitBtn.textContent = 'Get My Number';
      return;
    }

    // Count how many are already in this track
    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('track', track);

    if (count >= MAX_PER_TRACK) {
      showAlert(`The ${track} track is full (${MAX_PER_TRACK}/${MAX_PER_TRACK}). Try another track or contact your admin.`, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Get My Number';
      return;
    }

    const assignedNumber = count + 1;

    // Insert participant
    const { data: participant, error: insertError } = await supabase
      .from('participants')
      .insert([{ name, track, number: assignedNumber }])
      .select()
      .single();

    if (insertError) throw insertError;

    // Show result
    form.style.display = 'none';
    resultBox.style.display = 'block';
    resultBox.innerHTML = `
      <div class="number-badge">
        <div class="label">Your Accountability Number</div>
        <div class="num">${participant.number}</div>
        <div class="user-name">${participant.name}</div>
        <div style="margin-top:8px">
          <span class="track-pill track-${participant.track}">${participant.track}</span>
        </div>
      </div>
      <div class="alert alert-success" style="margin-top:20px; display:flex">
        ✅ You're registered! Save your number — you'll use it to look up your accountability partner once the shuffle is complete.
      </div>
      <div class="alert alert-info" style="display:flex">
        📌 Write it down: <strong style="margin-left:6px">${participant.name} — #${participant.number} (${participant.track})</strong>
      </div>
    `;
    await loadCounts();

  } catch (err) {
    console.error(err);
    showAlert('Something went wrong. Please try again or contact your admin.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Get My Number';
  }
}

// Init
form.addEventListener('submit', register);
loadCounts();

// Real-time count updates
supabase
  .channel('participants')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, loadCounts)
  .subscribe();

