import { resolveImageUrl } from './services/imageService.js';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Only plain colour values go into the style attribute. */
const safeColor = (c: unknown) =>
  typeof c === 'string' && /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(c.trim()) ? c.trim() : '';

/** Light or dark text for an initial, so it reads on the player's colour. Hex colours only; others keep the default. */
function initialInk(color: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) return '';
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Whichever of white or near-black has the higher contrast ratio (#1a1612 has luminance ~0.009)
  return 1.05 / (L + 0.05) > (L + 0.05) / 0.059 ? ';color:#fff' : ';color:#1a1612';
}

/**
 * A player's avatar, the same everywhere: their profile picture (with the
 * framing they chose) or, without one, their initial on their colour.
 * Decorative by default since the name always sits beside it; pass `alt`
 * where the picture stands alone. Use with <%~ %> in templates.
 */
export function avatar(
  src: unknown,
  name: unknown,
  color?: unknown,
  className = '',
  alt = '',
): string {
  const cls = `avatar${className ? ` ${className}` : ''}`;
  const url = typeof src === 'string' && src ? resolveImageUrl(src) : '';
  const hidden = alt ? '' : ' aria-hidden="true"';
  if (url) {
    return `<img class="${escapeHtml(cls)}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${hidden} loading="lazy" decoding="async">`;
  }
  const initial = ([...String(name ?? '').trim()][0] ?? '?').toUpperCase(); // whole character, so an emoji isn't split
  const bg = safeColor(color) || 'var(--color-surface)';
  return `<span class="${escapeHtml(cls)}" style="background:${bg}${initialInk(bg)}"${alt ? ` role="img" aria-label="${escapeHtml(alt)}"` : hidden}>${escapeHtml(initial)}</span>`;
}

/** Line icons drawn in currentColor (Lucide shapes, ISC), plus the rook mark. */
const ICONS: Record<string, string> = {
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  dice: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
};
const ROOK = '<path fill="currentColor" stroke="none" d="M234.667 54.84L149.333 5.646a43.6 43.6 0 0 0-42.917 0L21.082 54.84C5.522 63.624 0 76.675 0 91.984v98.636c0 15.31 8.031 29.364 21.333 37.145l85.334 49.192a43.6 43.6 0 0 0 42.917 0l85.083-49.192C247.969 220.235 256 205.929 256 190.62V91.984c0-15.31-8.031-29.364-21.333-37.145m-57.224 158.368c0 2.51-1.757 4.267-4.016 4.267H82.824c-2.51 0-4.267-1.757-4.267-4.267v-18.573c0-2.259.753-4.266 2.51-6.023l10.792-10.541l6.525-60.738c.251-1.757-.502-3.262-1.757-4.266l-8.784-7.78c-1.757-1.507-2.51-3.765-2.51-6.024V69.647c0-2.51 1.757-4.518 4.267-4.518h13.302c2.259 0 4.518 2.008 4.518 4.267v6.777h11.043v-6.526a4.5 4.5 0 0 1 4.517-4.518h10.793c2.258 0 4.015 2.008 4.015 4.267v6.777h11.043v-6.275c0-2.51 2.51-4.769 5.02-4.769h13.051c2.259 0 4.769 2.008 4.769 4.267v30.62c0 2.008-1.004 3.764-2.26 5.27l-9.536 7.78c-1.255 1.005-1.757 2.51-1.757 4.016l6.776 60.989l10.792 11.043c1.255 1.255 1.757 2.76 1.757 4.517zm-49.192-63.75c-7.027-.25-12.549 6.024-12.549 12.8v26.103c0 1.506 1.255 2.76 2.76 2.76h18.824c1.506 0 3.012-1.505 3.012-3.011v-25.851c-.25-6.777-5.02-12.55-12.047-12.8"/>';

/**
 * A small decorative icon that sits beside words saying the same thing, so
 * it's hidden from screen readers. Sized by .icon (1em) unless className
 * says otherwise. Use with <%~ %> in templates.
 */
export function icon(name: 'trophy' | 'crown' | 'dice' | 'flag' | 'keep', className = ''): string {
  const cls = `icon${className ? ` ${escapeHtml(className)}` : ''}`;
  if (name === 'keep') {
    return `<svg class="${cls}" viewBox="0 0 256 283" aria-hidden="true" focusable="false">${ROOK}</svg>`;
  }
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
