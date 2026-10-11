/**
 * A game's word for rounds or points as typed into its form, made ready for a
 * label: "Race" → "Races", "victory point" → "Victory points", "VP" → "VPs".
 * Must match normalizeUnitName and pluralize in src/services/units.ts.
 */
export function unitPlural(typed, fallback) {
  let word = String(typed ?? '').trim().replace(/\s+/g, ' ');
  if (!word) word = fallback;
  else if (word !== word.toUpperCase()) word = word.toLowerCase();
  let plural;
  if (/[A-Z]$/.test(word) && word === word.toUpperCase()) plural = `${word}s`;
  else if (/(s|x|z|ch|sh)$/i.test(word)) plural = `${word}es`;
  else if (/[^aeiou]y$/i.test(word)) plural = `${word.slice(0, -1)}ies`;
  else plural = `${word}s`;
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/*
 * Labels that name a unit follow its field as it's typed in:
 *   <label data-unit-label="round_name" data-unit-default="round"
 *          data-unit-template="{units} per game">Rounds per game</label>
 * The server renders the starting text; this only keeps it current.
 */
document.addEventListener('input', (e) => {
  const field = e.target;
  if (!(field instanceof HTMLInputElement) || !field.name) return;
  for (const label of document.querySelectorAll(`[data-unit-label="${CSS.escape(field.name)}"]`)) {
    label.textContent = label.dataset.unitTemplate.replace('{units}', unitPlural(field.value, label.dataset.unitDefault));
  }
});
