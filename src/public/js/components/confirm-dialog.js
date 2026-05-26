class ConfirmDialog extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <style>
        confirm-dialog dialog {
          padding: 0;
          max-width: 24rem;
          width: calc(100% - 2rem);
          border: none;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.25);
          position: fixed;
          inset: 0;
          margin: auto;
        }
        confirm-dialog dialog::backdrop {
          background: rgba(0 0 0 / 0.45);
          backdrop-filter: blur(3px);
        }
        @keyframes confirm-in {
          from { opacity: 0; transform: scale(0.95) translateY(-6px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        confirm-dialog dialog[open] {
          animation: confirm-in 180ms cubic-bezier(0.22, 1, 0.36, 1);
        }
      </style>
      <dialog>
        <div style="padding:1.5rem">
          <h2 id="confirm-title" style="font-size:1.25rem;margin-bottom:0.75rem">Confirm</h2>
          <p id="confirm-msg" style="color:var(--color-text-muted,#8b7d6b);margin-bottom:1.5rem"></p>
          <div style="display:flex;gap:0.75rem;justify-content:flex-end">
            <button type="button" id="confirm-cancel"
                    style="padding:0.5rem 1rem;border:2px solid var(--color-border,#b5a898);border-radius:8px;background:none;cursor:pointer;min-height:3rem;font-family:inherit;font-size:1rem;font-weight:600">
              Cancel
            </button>
            <button type="button" id="confirm-ok"
                    style="padding:0.5rem 1rem;border:none;border-radius:8px;background:var(--color-danger,#9b1c1c);color:#fff;cursor:pointer;min-height:3rem;font-family:inherit;font-size:1rem;font-weight:600">
              Confirm
            </button>
          </div>
        </div>
      </dialog>`;

    const dialog = this.querySelector('dialog');
    this.querySelector('#confirm-cancel').addEventListener('click', () => this.#resolve(false));
    this.querySelector('#confirm-ok').addEventListener('click', () => this.#resolve(true));
    dialog.addEventListener('cancel', () => this.#resolve(false));
    dialog.addEventListener('click', (e) => {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        this.#resolve(false);
      }
    });
  }

  #pendingResolve = null;

  confirm(message, { title = 'Are you sure?', confirmLabel = 'Confirm' } = {}) {
    this.querySelector('#confirm-title').textContent = title;
    this.querySelector('#confirm-msg').textContent = message;
    this.querySelector('#confirm-ok').textContent = confirmLabel;
    this.querySelector('dialog').showModal();
    return new Promise((resolve) => { this.#pendingResolve = resolve; });
  }

  #resolve(result) {
    this.querySelector('dialog').close();
    this.#pendingResolve?.(result);
    this.#pendingResolve = null;
  }
}

customElements.define('confirm-dialog', ConfirmDialog);
