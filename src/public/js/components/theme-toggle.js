class ThemeToggle extends HTMLElement {
  #btn;
  #onThemeChange;
  #themes = ['auto', 'light', 'dark'];
  #labels = { auto: '🌓 Auto', light: '☀ Light', dark: '🌙 Dark' };

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 6px;
          font-size: 1rem;
          min-height: 3rem;
          min-width: 3rem;
          color: inherit;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          white-space: nowrap;
          transition: background 120ms ease;
        }
        button:hover { background: var(--color-chrome-hover, rgba(255 255 255 / 0.1)); }
        button:focus-visible {
          outline: 3px solid var(--color-border-focus, #0066cc);
          outline-offset: 2px;
          border-radius: 4px;
        }
      </style>
      <button type="button" aria-label="Toggle color theme"></button>`;

    this.#btn = this.shadowRoot.querySelector('button');
    this.#render(this.#current());
    this.#btn.addEventListener('click', (e) => this.#cycle(e));
    // Keep every toggle on the page (desktop + mobile menu) in sync
    this.#onThemeChange = (e) => this.#render(e.detail.theme);
    document.addEventListener('themechange', this.#onThemeChange);
  }

  disconnectedCallback() {
    document.removeEventListener('themechange', this.#onThemeChange);
  }

  #current() {
    return localStorage.getItem('theme') ?? 'auto';
  }

  #cycle(event) {
    const idx = this.#themes.indexOf(this.#current());
    const next = this.#themes[(idx + 1) % this.#themes.length];
    localStorage.setItem('theme', next);

    const apply = () => {
      ThemeToggle.applyTheme(next);
      document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
    };

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduceMotion) {
      apply();
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
    transition.finished.finally(() => root.classList.remove('theme-transition'));
  }

  static applyTheme(theme) {
    if (theme === 'auto') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }

  #render(theme) {
    this.#btn.textContent = this.#labels[theme] ?? this.#labels.auto;
    this.#btn.setAttribute('aria-label', `Color theme: ${theme}. Click to change.`);
  }
}

customElements.define('theme-toggle', ThemeToggle);
