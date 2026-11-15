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
