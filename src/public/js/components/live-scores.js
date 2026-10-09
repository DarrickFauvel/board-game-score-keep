/**
 * Live sync for an active session page.
 *
 * The page's Datastar stream patches two signals and its data-effect calls
 * window.liveScores.update(scoresVersion, sessionStatus):
 *   scoresVersion — bumped whenever scores change on any device; this page
 *                   then fetches the re-rendered scoreboard and swaps it in.
 *   sessionStatus — 'completed' once someone completes the session; this page
 *                   celebrates the winner, then reloads to lock the scores.
 *
 * A refresh never interrupts someone mid-entry: it waits while a score field
 * is being typed in, a past round is open for correction, a dialog is open, or
 * the scoreboard was touched in the last moment.
 */
import { celebrateVictory } from './victory-celebration.js';

const section = document.getElementById('scoreboard-section');
const rows = document.getElementById('score-rows');

if (section && rows) {
  const QUIET_MS = 1500;
  let lastTouch = 0;
  let wanted = 0;      // latest version announced by the server
  let shown = 0;       // version currently on screen
  let timer = null;
  let celebrated = false;

  rows.addEventListener('pointerdown', () => { lastTouch = Date.now(); });
  rows.addEventListener('keydown', () => { lastTouch = Date.now(); });

  const busy = () => {
    const active = document.activeElement;
    const typing = active?.tagName === 'SCORE-INPUT' && active.shadowRoot?.activeElement?.tagName === 'INPUT';
    return typing
      || rows.querySelector('.round-card.is-editing')
      || document.querySelector('dialog[open]')
      || Date.now() - lastTouch < QUIET_MS;
  };

  const announce = (text) => {
    const el = document.getElementById('status-announcer');
    if (el) el.textContent = text;
  };

  async function refresh() {
    timer = null;
    if (shown >= wanted) return;
    if (busy()) { timer = setTimeout(refresh, 1000); return; }
    const target = wanted;
    try {
      const res = await fetch(section.dataset.scoreboardUrl, { headers: { Accept: 'text/html' }, cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const html = await res.text();
      // Re-check: someone may have started typing while the request was out
      if (busy()) { timer = setTimeout(refresh, 1000); return; }
      rows.innerHTML = html;
      shown = target;
      announce('Scores updated');
    } catch {
      timer = setTimeout(refresh, 3000);
      return;
    }
    if (shown < wanted) refresh();
  }

  async function celebrate() {
    if (celebrated || window.__completingHere) return;
    celebrated = true;
    try {
      const res = await fetch(section.dataset.celebrationUrl, { headers: { Accept: 'application/json' } });
      const { celebration } = await res.json();
      if (celebration?.winners?.length) await celebrateVictory(celebration);
    } finally {
      window.location.reload();
    }
  }

  window.liveScores = {
    update(version, status) {
      if (status === 'completed') return celebrate();
      if (!version || version <= wanted) return;
      wanted = version;
      if (!timer) refresh();
    },
  };
}
