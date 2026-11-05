// ============================================================
//  results.js  —  Partner lookup page logic
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const lookupForm  = document.getElementById('lookup-form');
const numInput    = document.getElementById('number-input');
const trackSel    = document.getElementById('track-select');
const lookupBtn   = document.getElementById('lookup-btn');
const alertBox    = document.getElementById('alert-box');
const resultBox   = document.getElementById('result-box');
const statusBanner = document.getElementById('status-banner');

function showAlert(msg, type = 'error') {
  alertBox.className = `alert alert-${type}`;
  alertBox.innerHTML = msg;
  alertBox.style.display = 'flex';
}

function hideAlert() {
  alertBox.style.display = 'none';
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

async function checkShuffleStatus() {
  const { data: state } = await supabase
    .from('shuffle_state')
    .select('shuffled, shuffled_at')
    .eq('id', 1)
    .single();

  if (!state?.shuffled) {
    statusBanner.className = 'alert alert-info';
    statusBanner.style.display = 'flex';
    statusBanner.innerHTML = '⏳ Shuffles are conducted periodically by the admin. If you just registered, you will be paired in the next shuffle round!';
    lookupBtn.disabled = false;
    return false;
  }

  const when = new Date(state.shuffled_at).toLocaleString();
  statusBanner.className = 'alert alert-success';
  statusBanner.style.display = 'flex';
  statusBanner.innerHTML = `✅ Last shuffle completed on ${when}. Enter your number and track to see your partner!`;
  lookupBtn.disabled = false;
  return true;
}

async function lookup(e) {
  e.preventDefault();
  hideAlert();
  resultBox.style.display = 'none';

  const number = parseInt(numInput.value);
  const track  = trackSel.value;

  if (!number || number < 1) return showAlert('Please enter a valid number.');
  if (!track) return showAlert('Please select your track.');

  lookupBtn.disabled = true;
  lookupBtn.innerHTML = '<span class="spinner"></span> Looking up…';

  try {
    // Find this participant
    const { data: me, error } = await supabase
      .from('participants')
      .select('id, name, track, number, partner_id')
      .eq('number', number)
      .eq('track', track)
      .single();

    if (error || !me) {
      showAlert(`No participant found with number <strong>#${number}</strong> in the <strong>${track}</strong> track. Double-check your details.`, 'error');
      lookupBtn.disabled = false;
      lookupBtn.textContent = 'Find My Partner';
      return;
    }

    // Find partner
    let partner = null;
    if (me.partner_id) {
      const { data: p } = await supabase
        .from('participants')
        .select('id, name, track, number')
        .eq('id', me.partner_id)
        .single();
      partner = p;
    }

    // Build result UI
    resultBox.style.display = 'block';
    resultBox.className = 'partner-reveal';

    if (!partner) {
      resultBox.innerHTML = `
        <div class="card">
          <div class="card-title">Your Registration</div>
          <div class="partner-info">
            <div class="partner-avatar">${getInitials(me.name)}</div>
            <div class="partner-details">
              <div class="partner-name">${me.name}</div>
              <div class="partner-num">#${me.number} · <span class="track-pill track-${me.track}">${me.track}</span></div>
            </div>
          </div>
          <div class="alert alert-info" style="margin-top:16px; display:flex">
            ⚠️ You don't have a partner assigned yet — you may be in a group of three. Contact your admin.
          </div>
        </div>
      `;
    } else {
      resultBox.innerHTML = `
        <div class="card">
          <div class="card-title">Your Accountability Pair</div>

          <!-- You -->
          <div class="partner-info">
            <div class="partner-avatar" style="background:var(--dark-3);border:2px solid var(--red)">${getInitials(me.name)}</div>
            <div class="partner-details">
              <div class="partner-name">${me.name}</div>
              <div class="partner-num">#${me.number} · <span class="track-pill track-${me.track}">${me.track}</span></div>
            </div>
          </div>

          <div class="connector-line">🤝 Accountability Partner</div>

          <!-- Partner -->
          <div class="partner-info">
            <div class="partner-avatar">${getInitials(partner.name)}</div>
            <div class="partner-details">
              <div class="partner-name">${partner.name}</div>
              <div class="partner-num">#${partner.number} · <span class="track-pill track-${partner.track}">${partner.track}</span></div>
            </div>
          </div>

          <div class="alert alert-success" style="margin-top:20px; display:flex">
            🎯 You and <strong style="margin:0 4px">${partner.name}</strong> are accountability partners! Reach out to them and keep each other on track.
          </div>
        </div>
      `;
    }

  } catch (err) {
    console.error(err);
    showAlert('Something went wrong. Please try again.', 'error');
  }

  lookupBtn.disabled = false;
  lookupBtn.textContent = 'Find My Partner';
}

// Init
lookupForm.addEventListener('submit', lookup);
checkShuffleStatus();

