// What a game calls its rounds and points ("race", "victory point"). Games
// store the singular, or nothing for the defaults; plurals are derived.

const MAX_LENGTH = 24;

/** English plural of the last word: race → races, match → matches, party → parties, VP → VPs. */
export function pluralize(word: string): string {
  if (/[A-Z]$/.test(word) && word === word.toUpperCase()) return `${word}s`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * A unit name from a form field, null when blank, false when unusable.
 * Lowercased so it reads naturally mid-sentence, unless it's an all-caps
 * abbreviation like "VP".
 */
export function normalizeUnitName(value: unknown): string | null | false {
  const raw = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!raw) return null;
  if (raw.length > MAX_LENGTH || !/^[\p{L}][\p{L} '’-]*$/u.test(raw)) return false;
  return raw === raw.toUpperCase() ? raw : raw.toLowerCase();
}

export const UNIT_NAME_ERROR =
  `Names for rounds and points need to be words (letters, spaces or hyphens), up to ${MAX_LENGTH} characters, like "race" or "victory point".`;

/** A game's words for rounds and points, in every form the pages need. */
export function gameUnits(game: { round_name?: unknown; point_name?: unknown } | null | undefined) {
  const round = typeof game?.round_name === 'string' && game.round_name ? game.round_name : 'round';
  const point = typeof game?.point_name === 'string' && game.point_name ? game.point_name : 'point';
  const rounds = pluralize(round);
  const points = pluralize(point);
  return {
    round, rounds, Round: capitalize(round), Rounds: capitalize(rounds),
    point, points, Point: capitalize(point), Points: capitalize(points),
    /** "1 point", "7 victory points" */
    pointCount: (n: number) => `${n} ${n === 1 ? point : points}`,
    /** "1 round", "3 races" */
    roundCount: (n: number) => `${n} ${n === 1 ? round : rounds}`,
  };
}
