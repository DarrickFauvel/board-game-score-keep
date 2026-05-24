import './components/theme-toggle.js';
import './components/score-input.js';
import './components/voice-input.js';
import './components/avatar-picker.js';
import './components/color-thief-picker.js';
import './components/game-image.js';
import './components/confirm-dialog.js';

/* Apply saved theme immediately to avoid flash */
const saved = localStorage.getItem('theme');
if (saved && saved !== 'auto') {
  document.documentElement.dataset.theme = saved;
}

/* Mount a shared confirm-dialog for programmatic use */
const dialog = document.createElement('confirm-dialog');
document.body.appendChild(dialog);
window.confirmAction = (msg, opts) => dialog.confirm(msg, opts);
