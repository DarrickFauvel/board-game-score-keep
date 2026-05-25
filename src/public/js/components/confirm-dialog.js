class ConfirmDialog extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <dialog style="padding:0;max-width:24rem;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.2)">
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

    this.querySelector('#confirm-cancel').addEventListener('click', () => this.#resolve(false));
    this.querySelector('#confirm-ok').addEventListener('click', () => this.#resolve(true));
    this.querySelector('dialog').addEventListener('cancel', () => this.#resolve(false));
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
