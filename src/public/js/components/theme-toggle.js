// A compact light/dark slide switch. The thumb carries the current mode's
// icon: sun on the left for light, moon on the right for dark.
// The off-state track defaults to the espresso header's colours; set
// --switch-track and --switch-track-line to place it on a light surface.
const SUN = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g></svg>`;
const MOON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/></svg>`;

class ThemeToggle extends HTMLElement {
  #btn;
  #onThemeChange;
  #osDark = matchMedia('(prefers-color-scheme: dark)');
  #onOsChange = () => this.#render(this.#current());

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-flex; }

        button {
          background: none;
          border: none;
          margin: 0;
          cursor: pointer;
          color: inherit;
          font: inherit;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          /* 48px tap area around the small track */
          min-height: var(--tap-min, 3rem);
          min-width: var(--tap-min, 3rem);
          padding: 0 0.5rem;
          border-radius: var(--radius-md, 10px);
          transition: background 120ms ease;
        }
        button:active { background: var(--color-chrome-hover, rgb(255 255 255 / 0.08)); }
        @media (hover: hover) and (pointer: fine) {
          button:hover { background: var(--color-chrome-hover, rgb(255 255 255 / 0.08)); }
        }
        button:focus-visible {
          outline: 3px solid var(--color-border-focus, #c9a45a);
          outline-offset: 2px;
        }

        .track {
          position: relative;
          flex: none;
          width: 44px;
          height: 24px;
          border-radius: 999px;
          background: var(--switch-track, rgb(255 255 255 / 0.14));
          box-shadow: inset 0 0 0 1px var(--switch-track-line, rgb(255 255 255 / 0.12));
          transition: background 200ms ease;
        }
        .thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #f3efe8;
          color: #a07c30;
          box-shadow: 0 1px 3px rgb(0 0 0 / 0.4);
          transition: transform 200ms cubic-bezier(.2, .7, .2, 1);
        }
        .thumb > span { display: grid; place-items: center; }
        .thumb svg { display: block; width: 12px; height: 12px; }
        .thumb .moon { display: none; }

        button[aria-checked="true"] .track { background: var(--color-gold, #c9a45a); box-shadow: none; }
        button[aria-checked="true"] .thumb { transform: translateX(20px); color: #0c0a08; }
        button[aria-checked="true"] .thumb .sun { display: none; }
        button[aria-checked="true"] .thumb .moon { display: grid; }

        @media (prefers-reduced-motion: reduce) {
          .track, .thumb { transition: none; }
        }
      </style>
      <button type="button" role="switch" aria-checked="false" aria-label="Dark mode">
        <span class="track" aria-hidden="true">
          <span class="thumb"><span class="sun">${SUN}</span><span class="moon">${MOON}</span></span>
        </span>
      </button>`;

    this.#btn = this.shadowRoot.querySelector('button');
    this.#render(this.#current());
    this.#btn.addEventListener('click', (e) => this.#toggle(e));
    // Keep every switch on the page (desktop + mobile menu) in sync
    this.#onThemeChange = (e) => this.#render(e.detail.theme);
    document.addEventListener('themechange', this.#onThemeChange);
    // Until a theme is picked the page follows the OS, so keep the switch in step
    this.#osDark.addEventListener('change', this.#onOsChange);
  }

  disconnectedCallback() {
    document.removeEventListener('themechange', this.#onThemeChange);
    this.#osDark.removeEventListener('change', this.#onOsChange);
  }

  // Light or dark. With no saved choice, start from the device's setting.
  #current() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return this.#osDark.matches ? 'dark' : 'light';
  }

  #toggle(event) {
    const next = this.#current() === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);

    const apply = () => {
      ThemeToggle.applyTheme(next);
      document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
    };

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduceMotion) {
      apply();
      this.#settled();
      return;
    }

    // Reveal the new theme as a soft-edged circle growing from the click point.
    // Keyboard activation has no pointer position, so fall back to the button's centre.
    const rect = this.#btn.getBoundingClientRect();
    const x = event.detail > 0 ? event.clientX : rect.left + rect.width / 2;
    const y = event.detail > 0 ? event.clientY : rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    const root = document.documentElement;
    root.style.setProperty('--theme-x', `${x}px`);
    root.style.setProperty('--theme-y', `${y}px`);
    root.style.setProperty('--theme-radius', `${radius}px`);
    root.classList.add('theme-transition');

    const transition = document.startViewTransition(apply);
    transition.finished.finally(() => {
      root.classList.remove('theme-transition');
      this.#settled();
    });
  }

  // Tell the page the switch has finished changing (reveal done, thumb at
  // rest), after a short beat so the new state is seen. The mobile menu
  // listens for this to close itself.
  #settled() {
    setTimeout(() => {
      this.dispatchEvent(new CustomEvent('theme-settled', { bubbles: true, composed: true }));
    }, ThemeToggle.SETTLE_PAUSE_MS);
  }

  static SETTLE_PAUSE_MS = 250;

  static applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }

  #render(theme) {
    this.#btn.setAttribute('aria-checked', String(theme === 'dark'));
  }
}

customElements.define('theme-toggle', ThemeToggle);
