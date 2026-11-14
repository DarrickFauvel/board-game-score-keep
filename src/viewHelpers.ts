import { resolveImageUrl } from './services/imageService.js';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Only plain colour values go into the style attribute. */
const safeColor = (c: unknown) =>
  typeof c === 'string' && /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(c.trim()) ? c.trim() : '';

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
  return `<span class="${escapeHtml(cls)}" style="background:${bg}"${alt ? ` role="img" aria-label="${escapeHtml(alt)}"` : hidden}>${escapeHtml(initial)}</span>`;
}
