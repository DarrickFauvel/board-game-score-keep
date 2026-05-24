class AvatarPicker extends HTMLElement {
  #tab = 'file';
  #stream = null;

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.#render();
  }

  #render() {
    const name = this.getAttribute('name') ?? 'image';
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .tabs { display: flex; gap: 4px; margin-bottom: 0.75rem; }
        .tab {
          padding: 0.375rem 0.75rem;
          border: 2px solid transparent;
          border-radius: 6px;
          background: none;
          cursor: pointer;
          font-size: 0.875rem;
          font-family: inherit;
          font-weight: 600;
          min-height: 3rem;
          color: var(--color-text-muted, #8b7d6b);
          transition: background 120ms ease, color 120ms ease;
        }
        .tab[aria-selected="true"] {
          background: var(--color-ink, #2c2416);
          color: var(--color-parchment, #f5f0e8);
          border-color: var(--color-ink, #2c2416);
        }
        .tab:hover:not([aria-selected="true"]) { background: var(--color-surface, #e8e0d0); }
        .tab:focus-visible { outline: 3px solid #0066cc; outline-offset: 2px; border-radius: 4px; }
        .panel { display: none; }
        .panel[data-active] { display: block; }
        input[type="file"] { font-family: inherit; font-size: 0.875rem; }
        input[type="text"] {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 2px solid var(--color-border, #b5a898);
          border-radius: 8px;
          font-size: 0.875rem;
          font-family: inherit;
          min-height: 3rem;
        }
        input:focus-visible { outline: 3px solid #0066cc; outline-offset: 2px; border-radius: 6px; }
        video { max-width: 100%; border-radius: 8px; }
        .btn {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0.375rem 1rem; font-weight: 600; font-size: 0.875rem;
          border-radius: 8px; border: 2px solid var(--color-border, #b5a898);
          background: none; cursor: pointer; min-height: 3rem;
          font-family: inherit; color: var(--color-text, #2c2416);
          transition: background 120ms ease; margin-top: 0.5rem;
        }
        .btn:hover { background: var(--color-surface, #e8e0d0); }
        .btn:focus-visible { outline: 3px solid #0066cc; outline-offset: 2px; border-radius: 6px; }
        canvas { display: none; }
        .preview { max-width: 160px; border-radius: 8px; margin-top: 0.5rem; }
      </style>

      <div class="tabs" role="tablist" aria-label="Image source">
        <button class="tab" role="tab" aria-selected="true" aria-controls="panel-file" id="tab-file">Upload File</button>
        <button class="tab" role="tab" aria-selected="false" aria-controls="panel-url" id="tab-url">Enter URL</button>
        <button class="tab" role="tab" aria-selected="false" aria-controls="panel-camera" id="tab-camera">Camera</button>
      </div>

      <div id="panel-file" class="panel" role="tabpanel" aria-labelledby="tab-file" data-active>
        <input type="file" name="${name}" accept="image/*" aria-label="Choose image file">
        <img class="preview" style="display:none" alt="Image preview">
      </div>

      <div id="panel-url" class="panel" role="tabpanel" aria-labelledby="tab-url">
        <input type="text" name="image_url" placeholder="https://example.com/image.jpg" aria-label="Image URL">
      </div>

      <div id="panel-camera" class="panel" role="tabpanel" aria-labelledby="tab-camera">
        <video autoplay muted playsinline aria-label="Camera preview"></video>
        <canvas></canvas>
        <div>
          <button type="button" class="btn" id="cam-start">Start Camera</button>
          <button type="button" class="btn" id="cam-capture" style="display:none">Capture Photo</button>
        </div>
        <input type="hidden" name="${name}_camera_data">
      </div>`;

    this.shadowRoot.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => this.#switchTab(tab.id.replace('tab-', '')));
    });

    const fileInput = this.shadowRoot.querySelector('input[type="file"]');
    const preview = this.shadowRoot.querySelector('.preview');
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
      }
    });

    this.shadowRoot.getElementById('cam-start')?.addEventListener('click', () => this.#startCamera());
    this.shadowRoot.getElementById('cam-capture')?.addEventListener('click', () => this.#capture(name));
  }

  #switchTab(tab) {
    this.#tab = tab;
    this.#stopCamera();
    this.shadowRoot.querySelectorAll('.tab').forEach((t) => {
      const active = t.id === `tab-${tab}`;
      t.setAttribute('aria-selected', active);
    });
    this.shadowRoot.querySelectorAll('.panel').forEach((p) => {
      if (p.id === `panel-${tab}`) p.dataset.active = '';
      else delete p.dataset.active;
    });
  }

  async #startCamera() {
    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = this.shadowRoot.querySelector('video');
      video.srcObject = this.#stream;
      this.shadowRoot.getElementById('cam-start').style.display = 'none';
      this.shadowRoot.getElementById('cam-capture').style.display = '';
    } catch {
      alert('Camera access denied or unavailable.');
    }
  }

  #capture(name) {
    const video = this.shadowRoot.querySelector('video');
    const canvas = this.shadowRoot.querySelector('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const hidden = this.shadowRoot.querySelector(`input[name="${name}_camera_data"]`);
    if (hidden) hidden.value = dataUrl;
    this.#stopCamera();

    const img = document.createElement('img');
    img.src = dataUrl;
    img.className = 'preview';
    this.shadowRoot.querySelector('.panel[data-active]').appendChild(img);
  }

  #stopCamera() {
    this.#stream?.getTracks().forEach((t) => t.stop());
    this.#stream = null;
    const start = this.shadowRoot.getElementById('cam-start');
    const capture = this.shadowRoot.getElementById('cam-capture');
    if (start) start.style.display = '';
    if (capture) capture.style.display = 'none';
    const video = this.shadowRoot.querySelector('video');
    if (video) video.srcObject = null;
  }

  disconnectedCallback() {
    this.#stopCamera();
  }
}

customElements.define('avatar-picker', AvatarPicker);
