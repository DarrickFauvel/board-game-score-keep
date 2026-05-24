class VoiceInput extends HTMLElement {
  #recognition = null;
  #btn = null;
  #listening = false;

  connectedCallback() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this.style.display = 'none'; return; }

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.375rem;
          border-radius: 50%;
          font-size: 1.25rem;
          min-width: 3rem;
          min-height: 3rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 120ms ease, transform 120ms ease;
          color: var(--color-text-muted, #8b7d6b);
          vertical-align: middle;
        }
        button[data-active] {
          background: #fee2e2;
          color: #991b1b;
          animation: pulse 1s ease-in-out infinite;
        }
        button:hover { background: var(--color-surface, #e8e0d0); }
        button:focus-visible { outline: 3px solid #0066cc; outline-offset: 2px; }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @media (prefers-reduced-motion: reduce) {
          button[data-active] { animation: none; }
        }
      </style>
      <button type="button" aria-label="Start voice input" title="Click to speak">🎙</button>`;

    this.#btn = this.shadowRoot.querySelector('button');
    this.#recognition = new SR();
    this.#recognition.continuous = false;
    this.#recognition.interimResults = false;
    this.#recognition.lang = 'en-US';

    this.#recognition.addEventListener('result', (e) => {
      const transcript = e.results[0][0].transcript;
      const target = document.querySelector(this.getAttribute('target'));
      if (target) {
        target.value = (target.value ? target.value + ' ' : '') + transcript;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.focus();
      }
    });

    this.#recognition.addEventListener('end', () => this.#setListening(false));
    this.#recognition.addEventListener('error', () => this.#setListening(false));
    this.#btn.addEventListener('click', () => this.#toggle());
  }

  #toggle() {
    if (this.#listening) {
      this.#recognition.stop();
    } else {
      this.#recognition.start();
      this.#setListening(true);
    }
  }

  #setListening(active) {
    this.#listening = active;
    if (active) {
      this.#btn.dataset.active = '';
      this.#btn.setAttribute('aria-label', 'Stop voice input');
    } else {
      delete this.#btn.dataset.active;
      this.#btn.setAttribute('aria-label', 'Start voice input');
    }
  }
}

customElements.define('voice-input', VoiceInput);
