class GameImage extends HTMLElement {
  connectedCallback() {
    const src = this.getAttribute('src') ?? '';
    const alt = this.getAttribute('alt') ?? '';

    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = alt;
      img.loading = 'lazy';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      img.addEventListener('load', () => {
        this.dispatchEvent(new CustomEvent('image-loaded', { bubbles: true, detail: { img } }));
        document.dispatchEvent(new CustomEvent('image-loaded', { detail: { img } }));
      });
      img.addEventListener('error', () => {
        img.replaceWith(this.#placeholder());
      });
      this.appendChild(img);
    } else {
      this.appendChild(this.#placeholder());
    }
  }

  #placeholder() {
    const div = document.createElement('div');
    div.setAttribute('aria-hidden', 'true');
    div.style.cssText = `
      width:100%;height:100%;min-height:8rem;
      background:var(--color-surface,#e8e0d0);
      display:flex;align-items:center;justify-content:center;
      font-size:4rem`;
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
