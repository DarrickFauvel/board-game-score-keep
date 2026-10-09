/**
 * Victory celebration: a fanfare, a spoken announcement of the winner and a
 * confetti overlay.
 *
 * Browsers only allow sound after the person has tapped something, so call
 * primeAudio() synchronously inside the tap (before any await), then
 * celebrateVictory(data) once the result is known. If sound is still blocked,
 * the overlay offers a "Play announcement" button instead.
 *
 * data: { gameName, score, winners: [{ name, color }] }
 */

let audioCtx = null;

/** Create/resume the audio context while the tap still counts as permission. */
export function primeAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { audioCtx = null; }
  // Some browsers also gate speech on a gesture; an empty utterance unlocks it
  try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* no speech support */ }
}

const soundAllowed = () => audioCtx?.state === 'running';

/** A short brass-style flourish: G4 C5 E5 G5, then a held C6 chord. */
function playFanfare() {
  if (!soundAllowed()) return 0;
  const t0 = audioCtx.currentTime + 0.05;
  const master = audioCtx.createGain();
  master.gain.value = 0.18;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  filter.connect(master).connect(audioCtx.destination);

  const note = (freq, start, length, level = 1) => {
    for (const detune of [-6, 6]) {
      const osc = audioCtx.createOscillator();
      const env = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      env.gain.setValueAtTime(0, t0 + start);
      env.gain.linearRampToValueAtTime(0.5 * level, t0 + start + 0.03);
      env.gain.setValueAtTime(0.5 * level, t0 + start + length - 0.06);
      env.gain.linearRampToValueAtTime(0, t0 + start + length);
      osc.connect(env).connect(filter);
      osc.start(t0 + start);
      osc.stop(t0 + start + length + 0.02);
    }
  };
  note(392.0, 0.00, 0.16);  // G4
  note(523.25, 0.16, 0.16); // C5
  note(659.25, 0.32, 0.16); // E5
  note(783.99, 0.48, 0.30); // G5
  for (const f of [1046.5, 659.25, 783.99]) note(f, 0.80, 1.0, 0.7); // C6 major chord
  return 1900; // ms until the flourish has finished
}

function announcementText({ gameName, score, winners }) {
  const pts = `${score} point${score === 1 ? '' : 's'}`;
  if (winners.length === 1) {
    const [w] = winners;
    return `Congratulations, ${w.name}! ${w.name} wins ${gameName} with ${pts}!`;
  }
  const names = winners.map((w) => w.name);
  const list = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `It's a tie! ${list} share the win in ${gameName} with ${pts}!`;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = document.documentElement.lang || 'en';
  u.rate = 1;
  u.pitch = 1.15;
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.startsWith('en') && v.localService);
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

function playAnnouncement(data) {
  const fanfareMs = playFanfare();
  setTimeout(() => speak(announcementText(data)), fanfareMs ? fanfareMs - 300 : 0);
}

/* ─── Confetti ───────────────────────────────────────── */
function launchConfetti(canvas, colors, reduceMotion) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = () => {
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  const w = () => canvas.clientWidth;
  const h = () => canvas.clientHeight;
  const count = reduceMotion ? 40 : Math.min(180, Math.round(w() / 2.2));
  const pieces = Array.from({ length: count }, (_, i) => ({
    x: reduceMotion ? Math.random() * w() : w() / 2 + (Math.random() - 0.5) * 60,
    y: reduceMotion ? Math.random() * h() : h() * 0.45,
    vx: (Math.random() - 0.5) * 9,
    vy: -6 - Math.random() * 9,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    size: 6 + Math.random() * 6,
    color: colors[i % colors.length],
    shape: i % 3,
  }));
  const draw = () => {
    ctx.clearRect(0, 0, w(), h());
    for (const p of pieces) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(0, -p.size / 2); ctx.lineTo(p.size / 2, p.size / 2); ctx.lineTo(-p.size / 2, p.size / 2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
  };
  if (reduceMotion) { draw(); return () => {}; }

  let frame;
  let bursts = 0;
  const step = () => {
    for (const p of pieces) {
      p.vy += 0.18;          // gravity
      p.vx *= 0.99;          // air
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > h() + 20 && bursts < 2) {
        // recycle into a second and third burst from the sides
        p.x = Math.random() < 0.5 ? 0 : w();
        p.y = h() * 0.7;
        p.vx = (p.x === 0 ? 1 : -1) * (3 + Math.random() * 6);
        p.vy = -8 - Math.random() * 8;
      }
    }
    if (pieces.every((p) => p.y > h() + 20)) bursts++;
    draw();
    if (bursts < 3) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  window.addEventListener('resize', size);
  return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', size); };
}

/* ─── Overlay ────────────────────────────────────────── */
let stylesAdded = false;
function addStyles() {
  if (stylesAdded) return;
  stylesAdded = true;
  const style = document.createElement('style');
  style.textContent = `
    .victory {
      position: fixed; inset: 0;
      width: 100%; height: 100%; max-width: none; max-height: none;
      margin: 0; padding: max(var(--space-3), env(safe-area-inset-top)) var(--space-2) max(var(--space-3), env(safe-area-inset-bottom));
      border: none; border-radius: 0;
      background: radial-gradient(circle at 50% 40%, color-mix(in oklab, var(--color-chrome) 70%, var(--color-gold)) 0%, var(--color-chrome) 70%);
      color: var(--color-chrome-text);
      display: grid; place-items: center; text-align: center;
      overflow: hidden;
    }
    .victory:not([open]) { display: none; }
    .victory::backdrop { background: var(--color-chrome); }
    .victory__confetti { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .victory__card { position: relative; display: grid; gap: var(--space-2); justify-items: center; max-width: 32rem; }
    .victory__trophy { font-size: clamp(4rem, 3rem + 8vw, 7rem); line-height: 1; animation: victory-pop 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
    .victory__eyebrow { font-size: var(--text-sm); letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-gold); }
    .victory__title {
      font-family: var(--font-display); font-weight: 700;
      font-size: clamp(2rem, 1.2rem + 6vw, 4rem); line-height: 1.1; text-wrap: balance;
      color: var(--color-chrome-text);
      text-shadow: 0 2px 0 rgba(0 0 0 / 0.35), 0 0 24px color-mix(in oklab, var(--color-gold) 60%, transparent);
      animation: victory-rise 600ms 200ms ease-out both;
    }
    .victory__detail { font-size: var(--text-base); opacity: 0.9; animation: victory-rise 600ms 350ms ease-out both; }
    .victory__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-2); margin-top: var(--space-2); animation: victory-rise 600ms 500ms ease-out both; }
    .victory__actions .btn--secondary { color: var(--color-chrome-text); border-color: color-mix(in oklab, var(--color-chrome-text) 50%, transparent); }
    .victory__actions .btn--secondary:hover { background: var(--color-chrome-hover); }
    @keyframes victory-pop { from { transform: scale(0.2) rotate(-20deg); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes victory-rise { from { transform: translateY(1rem); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .victory__trophy, .victory__title, .victory__detail, .victory__actions { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Shows the celebration; resolves when it is dismissed. */
export function celebrateVictory(data) {
  addStyles();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const names = data.winners.map((w) => w.name);
  const title = names.length === 1 ? `${names[0]} wins!` : `${names.join(' & ')} tie!`;

  const dialog = document.createElement('dialog');
  dialog.className = 'victory';
  dialog.setAttribute('aria-labelledby', 'victory-title');
  dialog.setAttribute('aria-describedby', 'victory-detail');
  dialog.innerHTML = `
    <canvas class="victory__confetti" aria-hidden="true"></canvas>
    <div class="victory__card">
      <div class="victory__trophy" aria-hidden="true">🏆</div>
      <p class="victory__eyebrow">${escapeHtml(data.gameName)}</p>
      <h2 class="victory__title" id="victory-title">${escapeHtml(title)}</h2>
      <p class="victory__detail" id="victory-detail">${data.score} point${data.score === 1 ? '' : 's'}</p>
      <div class="victory__actions">
        <button type="button" class="btn btn--gold" data-victory-sound>🔊 Play announcement</button>
        <button type="button" class="btn btn--secondary" data-victory-close>Continue</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);

  const soundBtn = dialog.querySelector('[data-victory-sound]');
  soundBtn.addEventListener('click', () => { primeAudio(); playAnnouncement(data); });

  const colors = [
    ...data.winners.map((w) => w.color).filter(Boolean),
    '#c9a84c', '#e8d5a3', '#8b1a1a', '#2d5a27', '#3b6fb6', '#f5f0e8',
  ];

  return new Promise((resolve) => {
    let stopConfetti = () => {};
    dialog.addEventListener('close', () => {
      stopConfetti();
      try { speechSynthesis.cancel(); } catch { /* ignore */ }
      dialog.remove();
      resolve();
    }, { once: true });
    dialog.querySelector('[data-victory-close]').addEventListener('click', () => dialog.close());

    dialog.showModal();
    stopConfetti = launchConfetti(dialog.querySelector('canvas'), colors, reduceMotion);
    // Sound plays on its own when the tap allowed it; otherwise the button is the way in
    if (soundAllowed()) {
      playAnnouncement(data);
      soundBtn.textContent = '🔊 Hear it again';
    }
    dialog.querySelector('[data-victory-close]').focus();
  });
}
