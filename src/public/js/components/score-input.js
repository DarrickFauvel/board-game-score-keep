class ScoreInput extends HTMLElement {
  static observedAttributes = ['value', 'min', 'max', 'step', 'disabled', 'session-id', 'participant-id', 'category-id', 'round'];

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.#render();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) this.#render();
  }

  #render() {
    const value = parseFloat(this.getAttribute('value') ?? '0');
    const min = parseFloat(this.getAttribute('min') ?? '-Infinity');
    const max = parseFloat(this.getAttribute('max') ?? 'Infinity');
    const step = parseFloat(this.getAttribute('step') ?? '1');
    const disabled = this.hasAttribute('disabled') || this.getAttribute('disabled') === 'true';
    const sessionId = this.getAttribute('session-id') ?? '';
    const participantId = this.getAttribute('participant-id') ?? '';
    const categoryId = this.getAttribute('category-id') ?? '';
    const round = this.getAttribute('round') ?? '';

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-flex; }
        .wrap {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          background: var(--color-bg-raised, #fff);
          border: 2px solid var(--color-border, #b5a898);
          border-radius: 8px;
          overflow: hidden;
        }
        button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          min-width: 3rem;
          min-height: 3rem;
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--color-text, #2c2416);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 120ms ease;
          -webkit-user-select: none;
          user-select: none;
        }
        button:hover:not(:disabled) { background: var(--color-surface, #e8e0d0); }
        button:focus-visible {
          outline: 3px solid #0066cc;
          outline-offset: -2px;
          border-radius: 6px;
        }
        button:disabled { opacity: 0.4; cursor: default; }
        input[type="number"] {
          width: 5rem;
          min-height: 3rem;
          border: none;
          text-align: center;
          font-size: 1.125rem;
          font-weight: 700;
          background: none;
          color: var(--color-text, #2c2416);
          font-family: inherit;
          -moz-appearance: textfield;
        }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input:focus-visible { outline: 3px solid #0066cc; border-radius: 4px; }
      </style>
      <div class="wrap" part="wrap">
        <button type="button" part="button" aria-label="Decrease" ${disabled ? 'disabled' : ''}>−</button>
        <input type="number"
               value="${value}"
               min="${isFinite(min) ? min : ''}"
               max="${isFinite(max) ? max : ''}"
               step="${step}"
               aria-label="${this.getAttribute('aria-label') ?? 'Score'}"
               ${disabled ? 'disabled' : ''}>
        <button type="button" part="button" aria-label="Increase" ${disabled ? 'disabled' : ''}>+</button>
      </div>`;

    const [decBtn, incBtn] = this.shadowRoot.querySelectorAll('button');
    const input = this.shadowRoot.querySelector('input');

    decBtn.addEventListener('click', () => {
      const newVal = Math.max(min, parseFloat(input.value) - step);
      input.value = newVal;
      this.#save(sessionId, participantId, categoryId, round, newVal);
    });

    incBtn.addEventListener('click', () => {
      const newVal = Math.min(max, parseFloat(input.value) + step);
      input.value = newVal;
      this.#save(sessionId, participantId, categoryId, round, newVal);
    });

    let debounce;
    input.addEventListener('change', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        this.#save(sessionId, participantId, categoryId, round, parseFloat(input.value));
      }, 400);
    });
  }

  async #save(sessionId, participantId, categoryId, round, value) {
    if (!sessionId || !participantId) return;

    const body = new URLSearchParams();
    body.set('participant_id', participantId);
    body.set('value', value);
    if (categoryId) body.set('category_id', categoryId);
    if (round) body.set('round', round);

    try {
      await fetch(`/sessions/${sessionId}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
      });
      const announcer = document.getElementById('status-announcer');
      if (announcer) {
        const label = this.getAttribute('aria-label') ?? 'Score';
        announcer.textContent = `${label} updated to ${value}`;
      }
    } catch { /* network errors are silent — the input retains its value */ }
  }
}

customElements.define('score-input', ScoreInput);
