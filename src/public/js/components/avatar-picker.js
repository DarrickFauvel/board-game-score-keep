class AvatarPicker extends HTMLElement {
  #tab = 'file';
  #stream = null;

  connectedCallback() {
    this.#render();
  }

  #render() {
    const name = this.getAttribute('name') ?? 'image';
    const ariaLabel = this.getAttribute('aria-label') ?? 'Image picker';
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', ariaLabel);

    this.innerHTML = `
      <style>
        avatar-picker { display: block; }
        avatar-picker .ap-tabs { display: flex; gap: 4px; margin-bottom: 0.75rem; }
        avatar-picker .ap-tab {
          padding: 0.375rem 0.75rem;
          border: 2px solid transparent;
          border-radius: 6px;
          background: none;
          cursor: pointer;
          font-size: 0.875rem;
          font-family: inherit;
          font-weight: 600;
          min-height: 3rem;
          color: var(--color-text, #2c2416);
          transition: background 120ms ease, color 120ms ease;
        }
        avatar-picker .ap-tab[aria-selected="true"] {
          background: var(--color-ink, #2c2416);
          color: oklch(from var(--color-ink, #2c2416) clamp(0.1, calc(0.1 + (0.55 - l) * 20), 0.95) 0 0);
          border-color: var(--color-ink, #2c2416);
        }
        avatar-picker .ap-tab:hover:not([aria-selected="true"]) { background: var(--color-surface, #e8e0d0); }
        avatar-picker .ap-tab:focus-visible { outline: 3px solid #0066cc; outline-offset: 2px; border-radius: 4px; }
        avatar-picker .ap-panel { display: none; }
        avatar-picker .ap-panel[data-active] { display: block; }
        avatar-picker input[type="file"] { font-family: inherit; font-size: 0.875rem; min-height: 3rem; }
        avatar-picker input[type="text"] {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 2px solid var(--color-border, #b5a898);
          border-radius: 8px;
          font-size: 0.875rem;
          font-family: inherit;
          min-height: 3rem;
        }
        avatar-picker input:focus-visible { outline: 3px solid #0066cc; outline-offset: 2px; border-radius: 6px; }
        avatar-picker video { max-width: 100%; border-radius: 8px; }
        avatar-picker .ap-btn {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0.375rem 1rem; font-weight: 600; font-size: 0.875rem;
          border-radius: 8px; border: 2px solid var(--color-border, #b5a898);
          background: none; cursor: pointer; min-height: 3rem;
          font-family: inherit; color: var(--color-text, #2c2416);
          transition: background 120ms ease; margin-top: 0.5rem;
        }
        avatar-picker .ap-btn:hover { background: var(--color-surface, #e8e0d0); }
        avatar-picker .ap-btn:focus-visible { outline: 3px solid #0066cc; outline-offset: 2px; border-radius: 6px; }
        avatar-picker canvas { display: none; }
        avatar-picker .ap-preview { max-width: 160px; border-radius: 8px; margin-top: 0.5rem; }
      </style>

      <div class="ap-tabs" role="tablist" aria-label="Image source">
        <button class="ap-tab" type="button" role="tab" aria-selected="true" aria-controls="ap-panel-file-${name}" id="ap-tab-file-${name}">Upload File</button>
        <button class="ap-tab" type="button" role="tab" aria-selected="false" aria-controls="ap-panel-url-${name}" id="ap-tab-url-${name}">Enter URL</button>
        <button class="ap-tab" type="button" role="tab" aria-selected="false" aria-controls="ap-panel-camera-${name}" id="ap-tab-camera-${name}">Camera</button>
      </div>

      <div id="ap-panel-file-${name}" class="ap-panel" role="tabpanel" aria-labelledby="ap-tab-file-${name}" data-active>
        <input type="file" name="${name}" accept="image/*" aria-label="Choose image file">
        <img class="ap-preview" style="display:none" alt="Image preview">
      </div>

      <div id="ap-panel-url-${name}" class="ap-panel" role="tabpanel" aria-labelledby="ap-tab-url-${name}">
        <input type="text" name="image_url" placeholder="https://example.com/image.jpg" aria-label="Image URL">
        <img class="ap-preview" style="display:none" alt="URL image preview">
      </div>

      <div id="ap-panel-camera-${name}" class="ap-panel" role="tabpanel" aria-labelledby="ap-tab-camera-${name}">
        <video autoplay muted playsinline aria-label="Camera preview"></video>
        <canvas></canvas>
        <div>
          <button type="button" class="ap-btn" id="ap-cam-start-${name}">Start Camera</button>
          <button type="button" class="ap-btn" id="ap-cam-capture-${name}" style="display:none">Capture Photo</button>
        </div>
        <input type="hidden" name="${name}_camera_data">
        <img class="ap-preview" style="display:none" alt="Captured photo preview">
      </div>`;

    this.querySelectorAll('.ap-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabKey = tab.id.replace(`ap-tab-`, '').replace(`-${name}`, '');
        this.#switchTab(tabKey, name);
      });
    });

    const fileInput = this.querySelector('input[type="file"]');
    const preview = this.querySelector('.ap-panel[data-active] .ap-preview');
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file && preview) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
        preview.addEventListener('load', () => {
          document.dispatchEvent(new CustomEvent('image-loaded', { detail: { img: preview } }));
        }, { once: true });
      }
    });

    const urlInput = this.querySelector(`#ap-panel-url-${name} input[type="text"]`);
    const urlPreview = this.querySelector(`#ap-panel-url-${name} .ap-preview`);
    urlInput?.addEventListener('blur', () => {
      const url = urlInput.value.trim();
      if (!url || !urlPreview) return;
      urlPreview.style.display = 'none';
      urlPreview.onload = () => {
        urlPreview.style.display = 'block';
        document.dispatchEvent(new CustomEvent('image-loaded', { detail: { img: urlPreview } }));
      };
      urlPreview.onerror = () => { urlPreview.style.display = 'none'; };
      urlPreview.src = `/proxy/image?url=${encodeURIComponent(url)}`;
    });

    this.querySelector(`#ap-cam-start-${name}`)?.addEventListener('click', () => this.#startCamera(name));
    this.querySelector(`#ap-cam-capture-${name}`)?.addEventListener('click', () => this.#capture(name));
  }

  #switchTab(tab, name) {
    this.#tab = tab;
    this.#stopCamera(name);
    this.querySelectorAll('.ap-tab').forEach((t) => {
      const active = t.id === `ap-tab-${tab}-${name}`;
      t.setAttribute('aria-selected', String(active));
    });
    this.querySelectorAll('.ap-panel').forEach((p) => {
      if (p.id === `ap-panel-${tab}-${name}`) p.dataset.active = '';
      else delete p.dataset.active;
    });
  }

  async #startCamera(name) {
    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = this.querySelector('video');
      video.srcObject = this.#stream;
      this.querySelector(`#ap-cam-start-${name}`).style.display = 'none';
      this.querySelector(`#ap-cam-capture-${name}`).style.display = '';
    } catch {
      alert('Camera access denied or unavailable.');
    }
  }

  #capture(name) {
    const video = this.querySelector('video');
    const canvas = this.querySelector('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const hidden = this.querySelector(`input[name="${name}_camera_data"]`);
    if (hidden) hidden.value = dataUrl;
    this.#stopCamera(name);

    const preview = this.querySelector(`#ap-panel-camera-${name} .ap-preview`);
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }
  }

  #stopCamera(name) {
    this.#stream?.getTracks().forEach((t) => t.stop());
    this.#stream = null;
    const start = this.querySelector(`#ap-cam-start-${name}`);
    const capture = this.querySelector(`#ap-cam-capture-${name}`);
    if (start) start.style.display = '';
    if (capture) capture.style.display = 'none';
    const video = this.querySelector('video');
    if (video) video.srcObject = null;
  }

  disconnectedCallback() {
    this.#stopCamera(this.getAttribute('name') ?? 'image');
  }
}

customElements.define('avatar-picker', AvatarPicker);
