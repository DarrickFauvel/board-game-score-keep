/**
 * <qr-share> — nav button that opens a modal with a QR code for the site root.
 *
 * Attributes:
 *   label — optional visible text next to the icon (used in the mobile menu)
 *
 * The URL is location.origin, which never has a trailing slash.
 * The QR library is loaded on first open so it costs nothing until used.
 */
const ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1.25em" height="1.25em" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
       aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>
  </svg>`;

let stylesInjected = false;
let instances = 0;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    qr-share { display: inline-flex; }

    .qr-share__btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      min-height: var(--tap-min);
      min-width: var(--tap-min);
      justify-content: center;
      padding: var(--space-1);
      border-radius: var(--radius-md);
      color: inherit;
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 600;
      transition: background var(--transition-fast);
    }
    .qr-share__btn:hover { background: var(--color-chrome-hover); }

    /* Mobile menu variant: full-width row like .site-header__mobile-link */
    qr-share[label] { display: flex; }
    qr-share[label] .qr-share__btn {
      width: 100%;
      justify-content: flex-start;
      padding: var(--space-1) var(--space-2);
    }

    .qr-share__dialog {
      width: min(22rem, calc(100% - 2rem));
      max-height: calc(100dvh - 2rem);
      overflow-y: auto;
      padding: var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-bg-raised);
      color: var(--color-text);
      box-shadow: var(--shadow-lg);
      text-align: center;
      inset: 0;
      margin: auto;

      /* Smooth open + close: animate in from @starting-style, and keep the
         dialog in the top layer until the closing transition finishes. */
      opacity: 0;
      transform: scale(0.92) translateY(0.75rem);
      transition:
        opacity 260ms ease,
        transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
        overlay 320ms allow-discrete,
        display 320ms allow-discrete;
    }
    .qr-share__dialog[open] {
      opacity: 1;
      transform: none;
    }
    @starting-style {
      .qr-share__dialog[open] {
        opacity: 0;
        transform: scale(0.92) translateY(0.75rem);
      }
    }

    .qr-share__dialog::backdrop {
      background: rgba(0 0 0 / 0);
      backdrop-filter: blur(0);
      transition:
        background 320ms ease,
        backdrop-filter 320ms ease,
        overlay 320ms allow-discrete,
        display 320ms allow-discrete;
    }
    .qr-share__dialog[open]::backdrop {
      background: rgba(0 0 0 / 0.5);
      backdrop-filter: blur(4px);
    }
    @starting-style {
      .qr-share__dialog[open]::backdrop {
        background: rgba(0 0 0 / 0);
        backdrop-filter: blur(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .qr-share__dialog,
      .qr-share__dialog::backdrop { transition: none; }
    }

    .qr-share__title {
      font-size: var(--text-lg);
      margin-bottom: var(--space-1);
    }
    .qr-share__hint {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      margin-bottom: var(--space-3);
    }
    /* Always dark-on-white so phone cameras can read it in either theme */
    .qr-share__code {
      width: min(14rem, 100%, 40dvh);
      margin-inline: auto;
      background: #fff;
      border-radius: var(--radius-md);
      padding: var(--space-1);
      aspect-ratio: 1;
      display: grid;
      place-items: center;
    }
    .qr-share__code svg { width: 100%; height: auto; display: block; }
    .qr-share__url {
      display: block;
      margin-top: var(--space-2);
      font-size: var(--text-xs);
      font-weight: 600;
      word-break: break-all;
    }
    .qr-share__close { margin-top: var(--space-3); width: 100%; }
  `;
  document.head.appendChild(style);
}

class QrShare extends HTMLElement {
  #dialog;
  #code;
  #rendered = false;

  connectedCallback() {
    injectStyles();
    const label = this.getAttribute('label');
    const url = location.origin;

    const titleId = `qr-share-title-${++instances}`;

    this.innerHTML = `
      <button type="button" class="qr-share__btn" aria-haspopup="dialog"
              ${label ? '' : 'aria-label="Show QR code for this site"'}>
        ${ICON}${label ? `<span>${label}</span>` : ''}
      </button>`;

    // The dialog lives on <body> so header/nav styles don't leak into it and
    // it still opens when this button sits inside the hidden mobile menu.
    this.#dialog = document.createElement('dialog');
    this.#dialog.className = 'qr-share__dialog';
    this.#dialog.setAttribute('aria-labelledby', titleId);
    this.#dialog.innerHTML = `
      <h2 class="qr-share__title" id="${titleId}">Scan to open The Keep</h2>
      <p class="qr-share__hint">Point a phone camera at the code.</p>
      <div class="qr-share__code" role="img" aria-label="QR code linking to ${url}"></div>
      <a class="qr-share__url" href="${url}">${url}</a>
      <button type="button" class="btn btn--secondary qr-share__close">Close</button>`;
    document.body.appendChild(this.#dialog);
    this.#code = this.#dialog.querySelector('.qr-share__code');

    this.querySelector('.qr-share__btn').addEventListener('click', () => this.#open());
    this.#dialog.querySelector('.qr-share__close').addEventListener('click', () => this.#dialog.close());
    // Click on the backdrop (outside the dialog box) closes it
    this.#dialog.addEventListener('click', (e) => {
      const r = this.#dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        this.#dialog.close();
      }
    });
  }

  disconnectedCallback() {
    this.#dialog?.remove();
  }

  async #open() {
    this.#dialog.showModal();
    if (this.#rendered) return;
    this.#rendered = true;
    try {
      const { default: qrcode } = await import('/vendor/qrcode-generator/qrcode.mjs');
      const qr = qrcode(0, 'M');
      qr.addData(location.origin);
      qr.make();
      this.#code.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    } catch {
      this.#rendered = false;
      this.#code.textContent = 'Could not load the QR code.';
    }
  }
}

customElements.define('qr-share', QrShare);
