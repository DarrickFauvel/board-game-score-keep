// Pasted links on a game. Both render as clickable links, so anything that
// isn't a plain web address is rejected rather than stored.

const BGG_HOSTS = new Set(['boardgamegeek.com', 'www.boardgamegeek.com']);

/** Parses a pasted web address as https; null when blank, false when unusable. */
function parseWebUrl(value: unknown): URL | null | false {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (raw.length > 500) return false;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) return false;
  return url;
}

/** A BoardGameGeek page link as https, null when blank, false when it isn't one. */
export function normalizeBggUrl(value: unknown): string | null | false {
  const url = parseWebUrl(value);
  if (!url) return url;
  if (!BGG_HOSTS.has(url.hostname.toLowerCase()) || url.pathname === '/') return false;
  url.protocol = 'https:';
  url.hash = '';
  return url.toString();
}

/** A rules link (publisher page, PDF, …): any web address, kept as given. */
export function normalizeRulesUrl(value: unknown): string | null | false {
  const url = parseWebUrl(value);
  return url ? url.toString() : url;
}

export const BGG_URL_ERROR =
  "That doesn't look like a BoardGameGeek link. Paste the address of the game's page, like https://boardgamegeek.com/boardgame/266192/wingspan.";
export const RULES_URL_ERROR =
  "The rules link needs to be a web address, like https://example.com/rules.pdf.";
