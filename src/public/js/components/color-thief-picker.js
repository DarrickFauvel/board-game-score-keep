class ColorThiefPicker extends HTMLElement {
  connectedCallback() {
    const targetSel = this.getAttribute('target-image');
    const primarySel = this.getAttribute('primary-input');
    const secondarySel = this.getAttribute('secondary-input');
    const accentSel = this.getAttribute('accent-input');

    this.innerHTML = `
      <button type="button" class="btn btn--secondary btn--sm" style="margin-bottom:0.5rem" id="ctp-extract">
        🎨 Extract colors from image
      </button>`;

    this.querySelector('#ctp-extract').addEventListener('click', () => {
      // Prefer the avatar-picker's live preview (newly selected file) over the server image
      const pickerPreview = document.querySelector('avatar-picker .ap-preview[src]');
      const img = (pickerPreview && pickerPreview.src) ? pickerPreview : document.querySelector(targetSel);
      if (!img || !img.src) { alert('Please add a game image first.'); return; }
      if (!img.complete) {
        img.addEventListener('load', () => this.#extract(img, primarySel, secondarySel, accentSel), { once: true });
      } else {
        this.#extract(img, primarySel, secondarySel, accentSel);
      }
    });

    document.addEventListener('image-loaded', (e) => {
      const img = e.detail?.img;
      if (img) this.#extract(img, primarySel, secondarySel, accentSel);
    });
  }

  #extract(img, primarySel, secondarySel, accentSel) {
    const canvas = document.createElement('canvas');
    const W = 80, H = 80;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    try {
      ctx.drawImage(img, 0, 0, W, H);
    } catch {
      console.warn('color-thief-picker: cannot read cross-origin image');
      return;
    }

    let data;
    try {
      data = ctx.getImageData(0, 0, W, H).data;
    } catch {
      console.warn('color-thief-picker: canvas tainted by cross-origin image');
      return;
    }
    const pixels = [];
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a > 128) pixels.push([r, g, b]);
    }

    const palette = this.#kMeans(pixels, 3);
    const [primary, secondary, accent] = palette.map(this.#toHex);

    this.#setColor(primarySel, primary);
    this.#setColor(secondarySel, secondary);
    this.#setColor(accentSel, accent);
  }

  #setColor(selector, hex) {
    if (!selector || !hex) return;
    const el = document.querySelector(selector);
    if (!el) return;
    el.value = hex;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const sibling = el.nextElementSibling;
    if (sibling && sibling.type === 'text') sibling.value = hex;
  }

  #kMeans(pixels, k) {
    if (pixels.length === 0) return Array(k).fill([128, 128, 128]);
    let centers = pixels.slice(0, k).map(p => [...p]);

    for (let iter = 0; iter < 10; iter++) {
      const clusters = Array.from({ length: k }, () => []);
      for (const px of pixels) {
        let best = 0, bestDist = Infinity;
        for (let i = 0; i < k; i++) {
          const d = this.#dist(px, centers[i]);
          if (d < bestDist) { bestDist = d; best = i; }
        }
        clusters[best].push(px);
      }
      for (let i = 0; i < k; i++) {
        if (clusters[i].length === 0) continue;
        centers[i] = [
          Math.round(clusters[i].reduce((s, p) => s + p[0], 0) / clusters[i].length),
          Math.round(clusters[i].reduce((s, p) => s + p[1], 0) / clusters[i].length),
          Math.round(clusters[i].reduce((s, p) => s + p[2], 0) / clusters[i].length),
        ];
      }
    }
    return centers.sort((a, b) => this.#luminance(b) - this.#luminance(a));
  }

  #dist([r1,g1,b1], [r2,g2,b2]) {
    return (r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2;
  }

  #luminance([r,g,b]) {
    return 0.299*r + 0.587*g + 0.114*b;
  }

  #toHex([r, g, b]) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
}

customElements.define('color-thief-picker', ColorThiefPicker);
