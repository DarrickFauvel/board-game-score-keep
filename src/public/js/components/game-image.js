class GameImage extends HTMLElement {
  connectedCallback() {
    const src = this.getAttribute('src') ?? '';
    const alt = this.getAttribute('alt') ?? '';
    const maxHeight = this.getAttribute('max-height') ?? '16rem';
    const imgId = this.getAttribute('img-id');

    Object.assign(this.style, {
      display: 'block',
      position: 'relative',
      overflow: 'hidden',
      background: 'var(--color-ink)',
    });

    if (src) {
      // Blurred cover fill behind the main image.
      // Uses background-image so the browser reuses the same cached response
      // as the <img> below — no extra network request.
      const bg = document.createElement('span');
      bg.setAttribute('aria-hidden', 'true');
      Object.assign(bg.style, {
        position: 'absolute',
        inset: '-10%',
        width: '120%',
        height: '120%',
        backgroundImage: `url('${src.replace(/'/g, "\\'")}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(28px) brightness(0.4) saturate(1.4)',
        pointerEvents: 'none',
        animation: 'cover-drift 20s linear infinite',
        transition: '--cover-scale 600ms ease, filter 600ms ease',
      });

      this.addEventListener('mouseenter', () => {
        bg.style.setProperty('--cover-scale', '1.15');
        bg.style.filter = 'blur(12px) brightness(0.6) saturate(1.8)';
      });
      this.addEventListener('mouseleave', () => {
        bg.style.setProperty('--cover-scale', '1');
        bg.style.filter = 'blur(28px) brightness(0.4) saturate(1.4)';
      });

      const img = document.createElement('img');
      // Proxy external URLs through the server when this image is a color-thief target,
      // so the canvas won't be tainted by cross-origin content.
      const isExternal = /^https?:\/\//i.test(src);
      img.src = (imgId && isExternal) ? `/proxy/image?url=${encodeURIComponent(src)}` : src;
      img.alt = alt;
      img.loading = 'lazy';
      if (imgId) img.id = imgId;
      Object.assign(img.style, {
        position: 'relative',
        zIndex: '1',
        display: 'block',
        width: '100%',
        height: 'auto',
        objectFit: 'contain',
        maxHeight,
      });

      img.addEventListener('error', () => {
        bg.remove();
        img.replaceWith(this.#placeholder());
      });

      this.appendChild(bg);
      this.appendChild(img);
    } else {
      this.appendChild(this.#placeholder());
    }
  }

  #placeholder() {
    const div = document.createElement('div');
    div.setAttribute('aria-hidden', 'true');
    Object.assign(div.style, {
      width: '100%',
      minHeight: '8rem',
      background: 'var(--color-surface,#e8e0d0)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '4rem',
    });
    div.innerHTML = this.#shieldSvg();
    return div;
  }

  #shieldSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64" aria-hidden="true">
      <path fill="var(--color-stone,#8b7d6b)" d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.25C17.25 21.15 21 16.25 21 11V5L12 1zm0 2.18l7 3.12v4.7c0 4.34-2.97 8.38-7 9.56-4.03-1.18-7-5.22-7-9.56V6.3l7-3.12z"/>
    </svg>`;
  }
}

customElements.define('game-image', GameImage);
