import './components/theme-toggle.js';
import './components/score-input.js';
import './components/voice-input.js';
import './components/avatar-picker.js';
import './components/avatar-cropper.js';
import './components/color-thief-picker.js';
import './components/game-image.js';
import './components/confirm-dialog.js';
import './components/qr-share.js';
import './components/photo-gallery.js';
import { primeAudio, celebrateVictory } from './components/victory-celebration.js';
import './components/live-scores.js';
import './units.js';

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

/* Plain buttons (type="button") with data-confirm ask first, then fire a
   "confirmed" event, so a Datastar action can follow:
   data-on:confirmed="@post('/…/delete')" */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[type="button"][data-confirm]');
  if (!btn) return;
  e.preventDefault();
  // "{name}" in the message is filled from a field's current value (data-confirm-name)
  const field = btn.dataset.confirmName && document.querySelector(btn.dataset.confirmName);
  const name = field?.value.trim();
  const message = btn.dataset.confirm.replace('{name}', name ? `the ${name}` : 'this');
  const ok = await window.confirmAction(message, {
    title: btn.dataset.confirmTitle || 'Are you sure?',
    confirmLabel: btn.dataset.confirmLabel || 'Confirm',
  });
  if (ok) btn.dispatchEvent(new CustomEvent('confirmed'));
});

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

/* Instant-save forms (data-autosave) save a moment after typing stops. If a
   link is followed inside that moment, save first, so the change shows on
   the next page. Datastar reports each request on document as
   "datastar-fetch" (started / finished). */
const lastInput = new Map();   // form → when it last changed
const lastSaved = new Map();   // form → when the last finished save started
const inFlight = new Map();    // form → when the current save started
const autosaveForm = (el) => el?.closest?.('form[data-autosave]');

document.addEventListener('input', (e) => {
  const form = autosaveForm(e.target);
  if (form) lastInput.set(form, performance.now());
});
document.addEventListener('datastar-fetch', (e) => {
  const form = autosaveForm(e.detail?.el);
  if (!form) return;
  if (e.detail.type === 'started') inFlight.set(form, performance.now());
  if (e.detail.type === 'finished') lastSaved.set(form, inFlight.get(form) ?? performance.now());
});

const unsavedForms = () => [...lastInput].filter(([form, at]) => form.isConnected && at > (lastSaved.get(form) ?? -1)).map(([form]) => form);

document.addEventListener('click', async (e) => {
  const link = e.target.closest('a[href]');
  if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (link.target && link.target !== '_self') return;
  const forms = unsavedForms();
  if (!forms.length) return;
  e.preventDefault();
  // A plain post saves the whole form, the same as the no-JavaScript button
  await Promise.allSettled(forms.map((form) => fetch(form.action, {
    method: 'POST',
    body: new URLSearchParams(new FormData(form)),
  })));
  window.location.href = link.href;
});
