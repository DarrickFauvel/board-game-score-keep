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
          border: 1px solid var(--color-border-strong, #d3ccc0);
          border-radius: var(--radius-md, 10px);
          box-shadow: var(--shadow-sm, none);
          overflow: hidden;
        }
        /* Saved: the same soft green flash as other fields that save instantly */
        .wrap.saved { animation: saved 1400ms ease-out; }
        @keyframes saved {
          0%   { box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-success, #2d6a3a) 60%, transparent); background: color-mix(in srgb, var(--color-success, #2d6a3a) 9%, var(--color-bg-raised, #fff)); }
          100% { box-shadow: 0 0 0 2px transparent; }
        }
        /* Not saved: a red ring stays until a save goes through */
        .wrap.error { box-shadow: 0 0 0 2px var(--color-danger, #b42318); }
        button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          /* In px, so the tap target doesn't shrink with the type: a phone is
             often passed around the table */
          min-width: 48px;
          min-height: 48px;
          font-size: 1.25rem;
          font-weight: 500;
          font-family: var(--font-text, inherit);
          color: var(--color-text, #1c1a17);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 120ms ease;
          -webkit-user-select: none;
          user-select: none;
          touch-action: manipulation;
        }
        button:active:not(:disabled) { background: var(--color-surface, #efebe3); }
        @media (hover: hover) and (pointer: fine) {
          button:hover:not(:disabled) { background: var(--color-surface, #efebe3); }
        }
        button:focus-visible {
          outline: 3px solid var(--color-border-focus, #1c1a17);
          outline-offset: -2px;
          border-radius: 6px;
        }
        button:disabled { opacity: 0.4; cursor: default; }
        /* ±10 for big-scoring games; smaller type so "+10" fits the same tap target */
        button.big { font-size: 0.95rem; color: var(--color-text-muted, #6b655c); }
        input[type="number"] {
          width: 3rem;
          min-height: 48px;
          border: none;
          text-align: center;
          font-size: 1.25rem;
          font-weight: 600;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
          background: none;
          color: var(--color-text, #1c1a17);
          font-family: var(--font-display, inherit);
          -moz-appearance: textfield;
        }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input:focus-visible { outline: 3px solid var(--color-border-focus, #1c1a17); border-radius: 4px; }
        @media (min-width: 48rem) {
          input[type="number"] { width: 5rem; }
        }
      </style>
      <div class="wrap" part="wrap">
        <button type="button" part="button" class="big" data-delta="-10" aria-label="Decrease by 10" ${disabled ? 'disabled' : ''}>−10</button>
        <button type="button" part="button" data-delta="-1" aria-label="Decrease" ${disabled ? 'disabled' : ''}>−</button>
        <input type="number"
               value="${value}"
               min="${isFinite(min) ? min : ''}"
               max="${isFinite(max) ? max : ''}"
               step="${step}"
               aria-label="${this.getAttribute('aria-label') ?? 'Score'}"
               ${disabled ? 'disabled' : ''}>
        <button type="button" part="button" data-delta="1" aria-label="Increase" ${disabled ? 'disabled' : ''}>+</button>
        <button type="button" part="button" class="big" data-delta="10" aria-label="Increase by 10" ${disabled ? 'disabled' : ''}>+10</button>
      </div>`;

    const input = this.shadowRoot.querySelector('input');

    // −/+ move by `step`; −10/+10 by ten steps. A cleared field counts as 0.
    this.shadowRoot.querySelectorAll('button[data-delta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const current = parseFloat(input.value) || 0;
        const newVal = Math.min(max, Math.max(min, current + Number(btn.dataset.delta) * step));
        input.value = newVal;
        this.#save(sessionId, participantId, categoryId, round, newVal);
      });
    });

    // 'change' already fires only on commit (blur/Enter), so save straight away:
    // a delayed save would be dropped if the commit came from tapping Next Round.
    input.addEventListener('change', () => {
      this.#save(sessionId, participantId, categoryId, round, parseFloat(input.value) || 0);
    });
  }

  async #save(sessionId, participantId, categoryId, round, value) {
    if (!sessionId || !participantId) return;
    const body = new URLSearchParams();
    body.set('participant_id', participantId);
    body.set('value', value);
    if (categoryId) body.set('category_id', categoryId);
    if (round) body.set('round', round);
    const label = this.getAttribute('aria-label') ?? 'Score';
    // Rapid taps send several saves; only the latest one's outcome is shown
    const attempt = ++this.#attempt;
    let error = null;
    try {
      const res = await fetch(`/sessions/${sessionId}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
        keepalive: true, // finish even if a form submit navigates away mid-request
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        error = data?.error || "That score didn't save. Try again.";
      }
    } catch {
      error = "That score didn't save. Check your connection and try again.";
    }
    if (attempt !== this.#attempt) return;
    this.#show(error ? 'error' : 'saved');
    const announcer = document.getElementById('status-announcer');
    if (error) window.showToast?.(error, 'error');
    else if (announcer) announcer.textContent = `${label} updated to ${value}`;
  }

  #attempt = 0;

  /** Flash green on a save (replaying the animation), or keep a red ring after a failure. */
  #show(state) {
    const wrap = this.shadowRoot?.querySelector('.wrap');
    if (!wrap) return;
    wrap.classList.remove('saved', 'error');
    void wrap.offsetWidth; // restart the animation
    wrap.classList.add(state);
  }
}
customElements.define('score-input', ScoreInput);
