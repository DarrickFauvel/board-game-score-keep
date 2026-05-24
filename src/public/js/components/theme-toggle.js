class ThemeToggle extends HTMLElement {
  #btn;
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
        button:hover { background: rgba(255 255 255 / 0.1); }
        button:focus-visible {
          outline: 3px solid #0066cc;
          outline-offset: 2px;
          border-radius: 4px;
        }
      </style>
      <button type="button" aria-label="Toggle color theme"></button>`;

    this.#btn = this.shadowRoot.querySelector('button');
    this.#applyTheme(this.#current());
    this.#btn.addEventListener('click', () => this.#cycle());
  }

  #current() {
    return localStorage.getItem('theme') ?? 'auto';
  }

  #cycle() {
    const idx = this.#themes.indexOf(this.#current());
    const next = this.#themes[(idx + 1) % this.#themes.length];
    this.#applyTheme(next);
    localStorage.setItem('theme', next);
  }

  #applyTheme(theme) {
    document.documentElement.dataset.theme = theme === 'auto' ? '' : theme;
    if (this.#btn) {
      this.#btn.textContent = this.#labels[theme] ?? this.#labels.auto;
      this.#btn.setAttribute('aria-label', `Color theme: ${theme}. Click to change.`);
    }
  }
}

customElements.define('theme-toggle', ThemeToggle);
