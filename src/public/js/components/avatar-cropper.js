/**
 * <avatar-cropper name="avatar_crop" src="…" crop="x,y,w,h">
 *
 * Frames a square avatar over the whole picture without changing it. Drag the
 * square to move it, drag a corner (or use the slider) to resize it, or focus
 * it and use the arrow keys (Shift+arrows, + and − to resize). The result is
 * a hidden input holding the square as fractions of the picture's width and
 * height; the server stores that beside the untouched original.
 *
 * It shows `src` on load (the current avatar's original) and switches to any
 * new picture an <avatar-picker> in the same form announces with
 * `avatar-image-selected`, starting that one centred.
 */
const MIN_PX = 48; // smallest square, in displayed pixels

class AvatarCropper extends HTMLElement {
  #img; #box; #input; #slider; #preview; #empty;
  #crop = null; // { x, y, s } in displayed pixels; the square's side is s
  #drag = null;

  connectedCallback() {
    const name = this.getAttribute('name') ?? 'avatar_crop';
    this.innerHTML = `
      <style>
        avatar-cropper { display: block; }
        avatar-cropper .ac-row { display: grid; gap: var(--space-3, 0.75rem); justify-items: start; }
        avatar-cropper .ac-stage { position: relative; display: inline-block; max-width: 100%; touch-action: none; user-select: none;
          border-radius: var(--radius-sm, 6px); overflow: hidden; background: var(--color-surface, #e8e0d0); line-height: 0; }
        avatar-cropper .ac-stage img { display: block; max-width: 100%; max-height: 22rem; width: auto; height: auto; pointer-events: none; }
        avatar-cropper .ac-box { position: absolute; box-sizing: border-box; cursor: move; border: 2px solid #fff;
          box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.55); outline: none; }
        avatar-cropper .ac-box::after { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 1px dashed rgb(255 255 255 / 0.8); }
        avatar-cropper .ac-box:focus-visible { border-color: var(--color-border-focus, #0066cc); }
        avatar-cropper .ac-h { position: absolute; width: 1.5rem; height: 1.5rem; margin: -0.75rem; z-index: 1; }
        avatar-cropper .ac-h::before { content: ""; position: absolute; inset: 0.45rem; background: #fff; border-radius: 2px; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4); }
        avatar-cropper .ac-h[data-c="nw"] { left: 0; top: 0; cursor: nwse-resize; }
        avatar-cropper .ac-h[data-c="ne"] { left: 100%; top: 0; cursor: nesw-resize; }
        avatar-cropper .ac-h[data-c="sw"] { left: 0; top: 100%; cursor: nesw-resize; }
        avatar-cropper .ac-h[data-c="se"] { left: 100%; top: 100%; cursor: nwse-resize; }
        avatar-cropper .ac-side { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3, 0.75rem); }
        avatar-cropper .ac-zoom { display: grid; gap: var(--space-1, 0.25rem); }
        avatar-cropper .ac-preview { width: 5rem; height: 5rem; border-radius: 50%; background: var(--color-surface, #e8e0d0) no-repeat;
          box-shadow: 0 0 0 1px var(--color-border, #b5a898); }
        avatar-cropper .ac-label { font-size: var(--text-sm, 0.875rem); color: var(--color-text-muted, #6b5e4e); }
        avatar-cropper input[type="range"] { width: 10rem; min-height: 2rem; accent-color: var(--color-primary, #2c2416); }
        avatar-cropper .ac-help { font-size: var(--text-sm, 0.875rem); color: var(--color-text-muted, #6b5e4e); margin: var(--space-2, 0.5rem) 0 0; max-width: 40ch; }
      </style>
      <p class="ac-help ac-empty" hidden>Choose a picture above to frame it.</p>
      <div class="ac-row" hidden>
        <div class="ac-stage">
          <img alt="">
          <div class="ac-box" tabindex="0" role="group"
               aria-label="Crop square. Arrow keys move it; Shift+arrows move faster; plus and minus resize it.">
            <span class="ac-h" data-c="nw"></span><span class="ac-h" data-c="ne"></span>
            <span class="ac-h" data-c="sw"></span><span class="ac-h" data-c="se"></span>
          </div>
        </div>
        <div class="ac-side">
          <div class="ac-preview" role="img" aria-label="Preview of your profile picture"></div>
          <div class="ac-zoom">
            <label class="ac-label" for="${name}-size">Zoom</label>
            <input type="range" id="${name}-size" min="0" max="100" value="0">
          </div>
        </div>
      </div>
      <p class="ac-help ac-tip" hidden>Drag the square to move it, or drag a corner to resize. Your original picture is kept as it is.</p>
      <input type="hidden" name="${name}">`;

    this.#img = this.querySelector('img');
    this.#box = this.querySelector('.ac-box');
    this.#input = this.querySelector('input[type="hidden"]');
    this.#slider = this.querySelector('input[type="range"]');
    this.#preview = this.querySelector('.ac-preview');
    this.#empty = this.querySelector('.ac-empty');

    this.#box.addEventListener('pointerdown', (e) => this.#startDrag(e));
    this.#box.addEventListener('keydown', (e) => this.#onKey(e));
    this.#slider.addEventListener('input', () => this.#onSlider());
    this.#ro = new ResizeObserver(() => this.#onResize());
    this.#ro.observe(this.#img);

    this.closest('form')?.addEventListener('avatar-image-selected', (e) => this.#load(e.detail.src, null));

    const src = this.getAttribute('src');
    if (src) this.#load(src, this.getAttribute('crop'));
    else this.#empty.hidden = false;
  }

  disconnectedCallback() { this.#ro?.disconnect(); }

  #ro; #frac = null; // crop as fractions, kept so a layout change doesn't drift it

  #load(src, cropAttr) {
    this.#empty.hidden = true;
    this.querySelector('.ac-row').hidden = false;
    this.querySelector('.ac-tip').hidden = false;
    this.#frac = parseFrac(cropAttr);
    this.#crop = null;
    this.#input.value = '';
    this.#img.onload = () => this.#onResize();
    this.#img.src = src;
    this.#preview.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
  }

  // Displayed size of the picture
  get #W() { return this.#img.clientWidth; }
  get #H() { return this.#img.clientHeight; }

  #onResize() {
    if (!this.#img.complete || !this.#W || !this.#H) return;
    const { W, H } = { W: this.#W, H: this.#H };
    if (this.#frac) {
      // Fractions of width and height describe a square in real pixels; average out any rounding
      const s = Math.min((this.#frac.w * W + this.#frac.h * H) / 2, W, H);
      this.#set(this.#frac.x * W, this.#frac.y * H, s, false);
    } else {
      // Start centred and as large as fits, the same framing an uncropped avatar gets
      const s = Math.min(W, H);
      this.#set((W - s) / 2, (H - s) / 2, s, false);
    }
  }

  /** Place the square, kept inside the picture. `commit` writes the hidden input. */
  #set(x, y, s, commit = true) {
    const W = this.#W, H = this.#H;
    s = Math.max(Math.min(s, W, H), Math.min(MIN_PX, W, H));
    x = Math.min(Math.max(x, 0), W - s);
    y = Math.min(Math.max(y, 0), H - s);
    this.#crop = { x, y, s };
    this.#frac = { x: x / W, y: y / H, w: s / W, h: s / H };
    Object.assign(this.#box.style, { left: `${x}px`, top: `${y}px`, width: `${s}px`, height: `${s}px` });

    const max = Math.min(W, H), min = Math.min(MIN_PX, max);
    this.#slider.value = String(max === min ? 0 : Math.round(((max - s) / (max - min)) * 100));

    // Preview: scale the picture so the square fills the circle (percentages, so any preview size works)
    this.#preview.style.backgroundSize = `${(W / s) * 100}% ${(H / s) * 100}%`;
    this.#preview.style.backgroundPosition = `${W === s ? 0 : (x / (W - s)) * 100}% ${H === s ? 0 : (y / (H - s)) * 100}%`;

    if (commit) {
      const f = (v) => v.toFixed(4);
      this.#input.value = `${f(this.#frac.x)},${f(this.#frac.y)},${f(this.#frac.w)},${f(this.#frac.h)}`;
    }
  }

  #startDrag(e) {
    if (!this.#crop || e.button > 0) return;
    e.preventDefault();
    this.#box.focus({ preventScroll: true });
    this.#box.setPointerCapture(e.pointerId);
    const corner = e.target.closest('.ac-h')?.dataset.c ?? null;
    this.#drag = { corner, px: e.clientX, py: e.clientY, ...this.#crop };
    const move = (ev) => this.#onDrag(ev);
    const up = () => {
      this.#box.removeEventListener('pointermove', move);
      this.#box.removeEventListener('pointerup', up);
      this.#box.removeEventListener('pointercancel', up);
      this.#drag = null;
    };
    this.#box.addEventListener('pointermove', move);
    this.#box.addEventListener('pointerup', up);
    this.#box.addEventListener('pointercancel', up);
  }

  #onDrag(e) {
    const d = this.#drag;
    if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.corner) return this.#set(d.x + dx, d.y + dy, d.s);

    // Resize from a corner, keeping the opposite corner pinned
    const left = d.corner.includes('w'), top = d.corner.includes('n');
    const ax = left ? d.x + d.s : d.x, ay = top ? d.y + d.s : d.y; // anchor
    const grow = Math.max(left ? -dx : dx, top ? -dy : dy);
    let s = d.s + grow;
    // Don't let the square pass the picture's edge on the side being dragged
    s = Math.min(s, left ? ax : this.#W - ax, top ? ay : this.#H - ay);
    s = Math.max(s, Math.min(MIN_PX, this.#W, this.#H));
    this.#set(left ? ax - s : ax, top ? ay - s : ay, s);
  }

  #onKey(e) {
    if (!this.#crop) return;
    const { x, y, s } = this.#crop;
    const step = e.shiftKey ? 20 : 4;
    const keys = {
      ArrowLeft: [x - step, y, s], ArrowRight: [x + step, y, s],
      ArrowUp: [x, y - step, s], ArrowDown: [x, y + step, s],
      '+': [x - step / 2, y - step / 2, s + step], '=': [x - step / 2, y - step / 2, s + step],
      '-': [x + step / 2, y + step / 2, s - step], '_': [x + step / 2, y + step / 2, s - step],
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    this.#set(...keys[e.key]);
  }

  #onSlider() {
    if (!this.#crop) return;
    const max = Math.min(this.#W, this.#H), min = Math.min(MIN_PX, max);
    const s = max - (Number(this.#slider.value) / 100) * (max - min);
    // Zoom around the square's centre
    const { x, y, s: old } = this.#crop;
    this.#set(x + (old - s) / 2, y + (old - s) / 2, s);
  }
}

function parseFrac(raw) {
  const n = (raw ?? '').split(',').map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return null;
  return { x: n[0], y: n[1], w: n[2], h: n[3] };
}

customElements.define('avatar-cropper', AvatarCropper);
