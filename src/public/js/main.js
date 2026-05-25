import './components/theme-toggle.js';
import './components/score-input.js';
import './components/voice-input.js';
import './components/avatar-picker.js';
import './components/color-thief-picker.js';
import './components/game-image.js';
import './components/confirm-dialog.js';

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
  if (ok) form.submit();
});
