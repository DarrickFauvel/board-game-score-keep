/** A round count from a form field: a whole number 1–99, or null for "not set". */
export function parseRoundCount(value: unknown): number | null {
  const n = Number(typeof value === 'string' ? value.trim() : value);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}
