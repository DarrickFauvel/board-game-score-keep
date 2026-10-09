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
  // getVoices() also starts Chrome's async voice load, ready by the time the fanfare ends
  try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); speechSynthesis.getVoices(); } catch { /* no speech support */ }
}

const soundAllowed = () => audioCtx?.state === 'running';

/**
 * Short brass-style flourishes; each celebration plays a random one, never the
 * same twice in a row. Notes are [pitch or chord, start s, length s, level?].
 */
const FANFARES = [
  // Classic: G4 C5 E5 G5, then a held C major chord
  [['G4', 0, 0.16], ['C5', 0.16, 0.16], ['E5', 0.32, 0.16], ['G5', 0.48, 0.30],
   [['C6', 'E5', 'G5'], 0.80, 1.0, 0.7]],
  // Bugle charge
  [['G4', 0, 0.12], ['C5', 0.12, 0.12], ['E5', 0.24, 0.12], ['G5', 0.36, 0.24],
   ['E5', 0.66, 0.12], [['G5', 'C5', 'E5'], 0.78, 0.9, 0.7]],
  // Ta-ta-ta-taaa, up a fifth
  [['C5', 0, 0.11], ['C5', 0.13, 0.11], ['C5', 0.26, 0.11], ['G5', 0.39, 0.45],
   [['C5', 'E5', 'G5', 'C6'], 0.90, 1.0, 0.6]],
  // Fast two-octave run to the top
  [['C4', 0, 0.08], ['E4', 0.08, 0.08], ['G4', 0.16, 0.08], ['C5', 0.24, 0.08],
   ['E5', 0.32, 0.08], ['G5', 0.40, 0.08], [['C6', 'E5', 'G5', 'C5'], 0.48, 1.1, 0.6]],
  // IV–V–I cadence in F
  [['F4', 0, 0.12], ['A4', 0.12, 0.12], ['C5', 0.24, 0.12], ['F5', 0.36, 0.24],
   [['Bb4', 'D5', 'F5'], 0.66, 0.28, 0.6], [['C5', 'E5', 'G5'], 0.96, 0.28, 0.6],
   [['F5', 'A5', 'C6'], 1.26, 1.0, 0.6]],
];
let lastFanfare = -1;

/** Note name such as 'G4' or 'Bb4' to Hz. */
function hz(name) {
  const [, letter, accidental, octave] = name.match(/^([A-G])(b|#)?(\d)$/);
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter]
    + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  return 440 * 2 ** ((12 * (Number(octave) + 1) + semitone - 69) / 12);
}

/** Plays a random fanfare; returns ms until it has finished (0 if muted). */
function playFanfare() {
  if (!soundAllowed()) return 0;
  let pick = Math.floor(Math.random() * (FANFARES.length - 1));
  if (pick >= lastFanfare && lastFanfare >= 0) pick++; // skip last time's
  lastFanfare = pick;
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
  let end = 0;
  for (const [pitch, start, length, level] of FANFARES[pick]) {
    for (const name of [pitch].flat()) note(hz(name), start, length, level);
    end = Math.max(end, start + length);
  }
  return Math.round((end + 0.1) * 1000);
}

const ordinal = (n) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n}${suffix}`;
};
const MILESTONES = [5, 10, 25, 50, 100];

/**
 * What's special about a winner's win in this game, most notable first.
 * facts: { wins, played, streak, gameRecord, personalBest, tookLead } or null.
 */
function winnerFactLines(name, facts, game) {
  if (!facts) return [];
  const lines = [];
  if (facts.gameRecord) lines.push(`${name} set a new ${game} record!`);
  if (facts.played === 1) lines.push(`A win on ${name}'s very first game of ${game}!`);
  if (facts.streak >= 3) lines.push(`That's ${facts.streak} ${game} wins in a row for ${name}!`);
  if (facts.tookLead) lines.push(`${name} takes the lead in the ${game} standings!`);
  if (facts.wins === 1 && facts.played > 1) lines.push(`${name}'s first ever ${game} win!`);
  if (MILESTONES.includes(facts.wins)) lines.push(`That's ${name}'s ${ordinal(facts.wins)} ${game} win!`);
  if (facts.streak === 2) lines.push(`${name} has won ${game} twice in a row!`);
  if (facts.personalBest) lines.push(`A personal best for ${name}!`);
  if (!lines.length && facts.wins > 1) lines.push(`That's ${name}'s ${ordinal(facts.wins)} ${game} win!`);
  return lines;
}

/** Up to two facts for a lone winner, one each in a tie so it stays short. */
function factLines({ gameName, winners }) {
  const perWinner = winners.length === 1 ? 2 : 1;
  return winners.flatMap((w) => winnerFactLines(w.name, w.facts, gameName).slice(0, perWinner));
}

function announcementText(data) {
  const { gameName, score, winners } = data;
  const pts = `${score} point${score === 1 ? '' : 's'}`;
  const facts = factLines(data).join(' ');
  if (winners.length === 1) {
    const [w] = winners;
    return `Congratulations, ${w.name}! ${w.name} wins ${gameName} with ${pts}! ${facts}`.trim();
  }
  const names = winners.map((w) => w.name);
  const list = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `It's a tie! ${list} share the win in ${gameName} with ${pts}! ${facts}`.trim();
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = document.documentElement.lang || 'en';
  // A different announcer each time: a random English voice (on-device ones
  // when there are any, since network voices can lag), with a little pitch and
  // pace variation so it still changes on devices that only have one voice
  u.rate = 0.95 + Math.random() * 0.15;
  u.pitch = 0.9 + Math.random() * 0.4;
  const voice = randomItem(englishVoices());
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

function englishVoices() {
  const english = speechSynthesis.getVoices().filter((v) => v.lang?.startsWith('en'));
  const local = english.filter((v) => v.localService);
  return local.length ? local : english;
}

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];

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
      /* The card centres itself with auto margins rather than place-items, so
         when it is taller than a short phone screen it starts at the top and
         the overlay scrolls, instead of being cut off at both ends */
      display: grid; justify-items: center; text-align: center;
      overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
    }
    .victory:not([open]) { display: none; }
    .victory::backdrop { background: var(--color-chrome); }
    .victory__confetti { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .victory__card { position: relative; display: grid; gap: var(--space-2); justify-items: center; max-width: 32rem; margin-block: auto; }
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
    .victory__facts {
      list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1);
      font-size: var(--text-lg); font-weight: 600; color: var(--color-gold); text-wrap: balance;
      animation: victory-rise 600ms 425ms ease-out both;
    }
    .victory__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-2); margin-top: var(--space-2); animation: victory-rise 600ms 500ms ease-out both; }
    .victory__actions .btn--secondary { color: var(--color-chrome-text); border-color: color-mix(in oklab, var(--color-chrome-text) 50%, transparent); }
    .victory__actions .btn--secondary:hover { background: var(--color-chrome-hover); }
    @keyframes victory-pop { from { transform: scale(0.2) rotate(-20deg); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes victory-rise { from { transform: translateY(1rem); opacity: 0; } to { transform: none; opacity: 1; } }
    /* Short screens (most phones): smaller trophy and title so it all fits */
    @media (max-height: 760px) {
      .victory__card { gap: var(--space-1); }
      .victory__trophy { font-size: clamp(2.5rem, 9dvh, 5rem); }
      .victory__title { font-size: clamp(1.75rem, 1rem + 5vw, 2.75rem); }
      .victory__facts { font-size: var(--text-sm); line-height: 1.3; }
      .victory__actions { margin-top: var(--space-1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .victory__trophy, .victory__title, .victory__detail, .victory__facts, .victory__actions { animation: none; }
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
  const facts = factLines(data);
  dialog.setAttribute('aria-describedby', facts.length ? 'victory-detail victory-facts' : 'victory-detail');
  dialog.innerHTML = `
    <canvas class="victory__confetti" aria-hidden="true"></canvas>
    <div class="victory__card">
      <div class="victory__trophy" aria-hidden="true">🏆</div>
      <p class="victory__eyebrow">${escapeHtml(data.gameName)}</p>
      <h2 class="victory__title" id="victory-title">${escapeHtml(title)}</h2>
      <p class="victory__detail" id="victory-detail">${data.score} point${data.score === 1 ? '' : 's'}</p>
      ${facts.length ? `<ul class="victory__facts" id="victory-facts">${facts.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : ''}
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
    // Keep the trophy and title in view: showModal() scrolls its autofocused
    // button into view, and on a short screen the buttons may sit below the fold
    dialog.querySelector('[data-victory-close]').focus({ preventScroll: true });
    dialog.scrollTop = 0;
  });
}
