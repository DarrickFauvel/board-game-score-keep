import './components/theme-toggle.js';
import './components/score-input.js';
import './components/voice-input.js';
import './components/avatar-picker.js';
import './components/color-thief-picker.js';
import './components/game-image.js';
import './components/confirm-dialog.js';
import './components/qr-share.js';
import './components/photo-gallery.js';
import { primeAudio, celebrateVictory } from './components/victory-celebration.js';
import './components/live-scores.js';

/* Mount a shared confirm-dialog for programmatic use */
const dialog = document.createElement('confirm-dialog');
document.body.appendChild(dialog);
window.confirmAction = (msg, opts) => dialog.confirm(msg, opts);

/* Global handler: forms with data-confirm show modal before submitting */
document.addEventListener('submit', async (e) => {
  const form = e.target;
  const msg = form.dataset.confirm;
  if (!msg) return;
  e.preventDefault();
  const ok = await window.confirmAction(msg, {
    title: form.dataset.confirmTitle || 'Are you sure?',
    confirmLabel: form.dataset.confirmLabel || 'Confirm',
  });
  if (!ok) return;
  if (form.dataset.celebrate !== undefined) return completeAndCelebrate(form);
  form.submit();
});

/* Completing a session celebrates the winner on this page, so the confirming
   tap still counts as permission to play sound; then reload to lock scores. */
async function completeAndCelebrate(form) {
  primeAudio(); // must run before any await
  window.__completingHere = true; // live-scores.js skips its own celebration for this tab
  try {
    const res = await fetch(form.action, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)),
    });
    if (!res.ok) throw new Error(String(res.status));
    const { celebration } = await res.json();
    if (celebration?.winners?.length) await celebrateVictory(celebration);
    window.location.reload();
  } catch {
    form.submit(); // fall back to the plain post-and-redirect
  }
}

/* "Celebrate again" on a completed session */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-celebrate-url]');
  if (!btn) return;
  primeAudio();
  btn.disabled = true;
  try {
    const res = await fetch(btn.dataset.celebrateUrl, { headers: { Accept: 'application/json' } });
    const { celebration } = await res.json();
    if (celebration?.winners?.length) await celebrateVictory(celebration);
  } finally {
    btn.disabled = false;
  }
});
