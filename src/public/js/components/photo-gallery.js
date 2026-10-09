/**
 * <photo-gallery action="/games/:g/sessions/:s/photos">
 *
 * Wraps the session photo grid. Photos upload one at a time in the background,
 * each tile appearing immediately, so people can take photo after photo without
 * waiting. Tapping a tile opens a shared dialog to set its caption and who was
 * playing. Server-rendered children: a fallback <form>, [data-photo-grid], and
 * the <dialog>.
 */

// Phone photos are often 3–12 MB; Cloudinary stores at most 1200×900, so shrink
// before upload to save mobile data and stay under the server's 10 MB limit.
const MAX_EDGE = 2400;

async function shrink(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 4 * 1024 * 1024) { bitmap.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file; // undecodable here (e.g. HEIC on some browsers) — let the server try
  }
}

class PhotoGallery extends HTMLElement {
  #queue = Promise.resolve();
  #pending = 0;

  connectedCallback() {
    this.querySelector('.photo-gallery__fallback')?.setAttribute('hidden', '');
    this.#renderControls();

    this.addEventListener('click', (e) => {
      const open = e.target.closest('[data-photo-edit]');
      if (open) this.#openEditor(open.closest('.photo-tile'));
    });
    this.querySelector('[data-photo-cancel]')?.addEventListener('click', () => this.#dialog.close());
  }

  get #grid() { return this.querySelector('[data-photo-grid]'); }
  get #dialog() { return this.querySelector('.photo-dialog'); }

  #renderControls() {
    // A camera-capture input only makes sense on touch devices; desktops get the picker.
    const touch = matchMedia('(pointer: coarse)').matches;
    const controls = document.createElement('div');
    controls.className = 'photo-gallery__controls';
    controls.innerHTML = `
      ${touch ? `
      <label class="btn btn--primary photo-gallery__pick">
        Take photo
        <input type="file" accept="image/*" capture="environment" class="visually-hidden">
      </label>` : ''}
      <label class="btn ${touch ? 'btn--secondary' : 'btn--primary'} photo-gallery__pick">
        ${touch ? 'Choose photos' : 'Add photos'}
        <input type="file" accept="image/*" multiple class="visually-hidden">
      </label>
      <p class="form-hint photo-gallery__status" role="status" aria-live="polite"></p>`;
    this.#grid.before(controls);

    controls.querySelectorAll('input[type="file"]').forEach((input) => {
      input.addEventListener('change', () => {
        for (const file of input.files) this.#enqueue(file);
        input.value = ''; // so the same photo/camera can be used again straight away
      });
    });
  }

  #status(text) {
    const el = this.querySelector('.photo-gallery__status');
    if (el) el.textContent = text;
  }

  #enqueue(file) {
    this.querySelector('[data-photo-empty]')?.remove();
    const tile = document.createElement('li');
    tile.className = 'photo-tile is-uploading';
    const preview = URL.createObjectURL(file);
    tile.innerHTML = `
      <button type="button" class="photo-tile__open" data-photo-edit disabled aria-label="Uploading photo">
        <img alt="Session photo">
      </button>
      <span class="photo-tile__badge">Uploading…</span>`;
    tile.querySelector('img').src = preview;
    this.#grid.append(tile);

    this.#pending++;
    this.#status(`Uploading ${this.#pending} photo${this.#pending === 1 ? '' : 's'}…`);
    // Sequential, so photos keep the order they were taken in
    this.#queue = this.#queue.then(() => this.#upload(file, tile, preview));
  }

  async #upload(file, tile, preview) {
    const badge = tile.querySelector('.photo-tile__badge');
    try {
      const body = new FormData();
      body.append('photos', await shrink(file));
      const res = await fetch(this.getAttribute('action'), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body,
      });
      if (!res.ok) throw new Error(String(res.status));
      const { photos } = await res.json();
      const photo = photos?.[0];
      if (!photo) throw new Error('No photo saved');

      tile.id = `photo-${photo.id}`;
      tile.dataset.photoId = photo.id;
      tile.dataset.caption = '';
      tile.dataset.participants = '';
      tile.classList.remove('is-uploading');
      badge.remove();
      const open = tile.querySelector('[data-photo-edit]');
      open.disabled = false;
      open.setAttribute('aria-label', 'Edit photo');
      // Keep showing the local preview; the stored copy is identical once processed
    } catch {
      tile.classList.remove('is-uploading');
      tile.classList.add('is-failed');
      badge.textContent = 'Failed — tap to retry';
      const open = tile.querySelector('[data-photo-edit]');
      open.removeAttribute('data-photo-edit');
      open.disabled = false;
      open.setAttribute('aria-label', 'Upload failed. Retry');
      open.addEventListener('click', () => {
        tile.remove();
        URL.revokeObjectURL(preview);
        this.#enqueue(file);
      }, { once: true });
    } finally {
      this.#pending--;
      this.#status(this.#pending ? `Uploading ${this.#pending} photo${this.#pending === 1 ? '' : 's'}…` : 'Photos saved.');
    }
  }

  #openEditor(tile) {
    const id = tile?.dataset.photoId;
    const dialog = this.#dialog;
    if (!id || !dialog) return;
    const action = `${this.getAttribute('action')}/${id}`;

    const form = dialog.querySelector('[data-photo-form]');
    form.action = action;
    form.elements.caption.value = tile.dataset.caption ?? '';
    const tagged = new Set((tile.dataset.participants ?? '').split(',').filter(Boolean));
    form.querySelectorAll('input[name="participant_ids"]').forEach((box) => {
      box.checked = tagged.has(box.value);
    });
    const img = dialog.querySelector('.photo-dialog__img');
    img.src = tile.querySelector('img').src;
    dialog.querySelector('[data-photo-delete]').action = `${action}/delete`;

    dialog.showModal();
  }
}

customElements.define('photo-gallery', PhotoGallery);
