// Who wins a game: the highest total (the default) or the lowest, for games
// like Golf or Hearts. Every scoreboard, the celebration and the standings
// decide winners through this, so they always agree.

/** True when the game's form value or stored column says lowest score wins. */
export function isLowestWins(value: unknown): boolean {
  return Number(value) === 1 || value === '1' || value === true;
}

export function winRule(game: { lowest_wins?: unknown } | null | undefined) {
  const lowestWins = isLowestWins(game?.lowest_wins);
  /** True when total a beats total b. */
  const beats = (a: number, b: number) => (lowestWins ? a < b : a > b);
  return {
    lowestWins,
    beats,
    /** Sort comparator: the best total first. */
    compare: (a: number, b: number) => (lowestWins ? a - b : b - a),
    /** The best of these totals (0 when there are none). */
    best: (totals: number[]) =>
      totals.length ? (lowestWins ? Math.min(...totals) : Math.max(...totals)) : 0,
    /**
     * The total that wins, or null while the game is undecided. Highest wins
     * needs someone above 0. Lowest wins needs someone off 0, since a sheet of
     * zeros means nobody has scored yet, not that everyone won.
     */
    winningTotal(totals: number[]): number | null {
      if (!totals.length) return null;
      if (lowestWins) return totals.some((t) => t !== 0) ? Math.min(...totals) : null;
      const top = Math.max(...totals);
      return top > 0 ? top : null;
    },
  };
}
