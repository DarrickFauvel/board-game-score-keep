import { db } from '../db/client.js';

export interface Standing {
  key: string;
  rank: number;
  playerId: string | null;
  name: string;
  avatarUrl: string | null;
  color: string | null;
  played: number;
  wins: number;
  winRate: number;          // 0–100, rounded
  avgFinish: number;        // 1 = always first
  avgScore: number | null;  // only meaningful within one game
  bestScore: number | null;
}

export interface Victory {
  sessionId: string;
  gameId: string;
  gameName: string;
  completedAt: string;
  winners: string[];
}

interface ParticipantResult {
  session_id: string;
  game_id: string;
  game_name: string;
  completed_at: string;
  participant_id: string;
  player_id: string | null;
  display_name: string;
  color: string | null;
  player_name: string | null;
  avatar_url: string | null;
  preferred_color: string | null;
  total: number;
}

/**
 * Who counts as the same person across sessions: registered players by their
 * player id; guests (no player id) by name, ignoring case and spacing — so two
 * different guests with the same name are merged.
 */
function personKey(r: ParticipantResult) {
  return r.player_id ? `p:${r.player_id}` : `n:${r.display_name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

/** Every participant's total in the user's completed sessions, oldest session first. */
async function fetchResults(userId: string, gameId?: string): Promise<ParticipantResult[]> {
  const result = await db.execute({
    sql: `SELECT s.id AS session_id, s.game_id, g.name AS game_name, s.completed_at,
                 sp.id AS participant_id, sp.player_id, sp.display_name, sp.color,
                 p.display_name AS player_name, p.avatar_url, p.preferred_color,
                 COALESCE(SUM(se.value), 0) AS total
          FROM sessions s
          JOIN games g ON g.id = s.game_id AND g.owner_id = ?
          JOIN session_participants sp ON sp.session_id = s.id
          LEFT JOIN players p ON p.id = sp.player_id
          LEFT JOIN score_entries se ON se.participant_id = sp.id
          WHERE s.status = 'completed' ${gameId ? 'AND s.game_id = ?' : ''}
          GROUP BY sp.id
          ORDER BY s.completed_at, sp.sort_order`,
    args: gameId ? [userId, gameId] : [userId],
  });
  return (result.rows as unknown as ParticipantResult[]).map((r) => ({ ...r, total: Number(r.total) }));
}

/** Results grouped by session, in completion order, without solo sessions. */
function bySession(rows: ParticipantResult[]) {
  const sessions = new Map<string, ParticipantResult[]>();
  for (const r of rows) sessions.set(r.session_id, [...(sessions.get(r.session_id) ?? []), r]);
  return [...sessions.values()].filter((participants) => participants.length >= 2);
}

/** Everyone tied on the highest positive total — the scoreboard's trophy rule. */
function winnersOf(participants: ParticipantResult[]) {
  const top = Math.max(...participants.map((p) => p.total));
  return top > 0 ? participants.filter((p) => p.total === top) : [];
}

/**
 * Ranks people across sessions. A session is won by everyone tied on the
 * highest positive total. Solo sessions are skipped since a one-player "win"
 * says nothing. Ranked by wins, then win rate, then games played; tied players
 * share a rank.
 */
function rank(rows: ParticipantResult[]): { standings: Standing[]; sessionCount: number } {
  const sessions = bySession(rows);
  const people = new Map<string, Standing & { finishSum: number; scoreSum: number }>();
  for (const participants of sessions) {
    const winners = new Set(winnersOf(participants));
    for (const p of participants) {
      const key = personKey(p);
      // Competition ranking within the session: 1 + number of strictly higher totals
      const finish = 1 + participants.filter((o) => o.total > p.total).length;
      const person = people.get(key) ?? {
        key, rank: 0, playerId: p.player_id, name: p.player_name ?? p.display_name.trim(),
        avatarUrl: p.avatar_url, color: p.preferred_color ?? p.color,
        played: 0, wins: 0, winRate: 0, avgFinish: 0, avgScore: null, bestScore: null,
        finishSum: 0, scoreSum: 0,
      };
      person.played++;
      if (winners.has(p)) person.wins++;
      person.finishSum += finish;
      person.scoreSum += p.total;
      person.bestScore = person.bestScore === null ? p.total : Math.max(person.bestScore, p.total);
      // Guests keep the latest spelling and colour they were entered with
      if (!p.player_id) { person.name = p.display_name.trim(); person.color = p.color ?? person.color; }
      people.set(key, person);
    }
  }

  const standings = [...people.values()].map(({ finishSum, scoreSum, ...s }) => ({
    ...s,
    winRate: Math.round((s.wins / s.played) * 100),
    avgFinish: Math.round((finishSum / s.played) * 10) / 10,
    avgScore: Math.round((scoreSum / s.played) * 10) / 10,
  }));
  standings.sort((a, b) =>
    b.wins - a.wins || b.winRate - a.winRate || b.played - a.played || a.name.localeCompare(b.name));
  standings.forEach((s, i) => {
    const prev = standings[i - 1];
    s.rank = prev && prev.wins === s.wins && prev.winRate === s.winRate ? prev.rank : i + 1;
  });
  return { standings, sessionCount: sessions.length };
}

export const standingsService = {
  /** Rankings across the user's completed sessions, optionally for one game. */
  async forUser(userId: string, gameId?: string) {
    return rank(await fetchResults(userId, gameId));
  },

  /**
   * The home page's hall of fame, from one query: the overall top three (with
   * at least one win), each game's leaders, and the latest decided sessions.
   */
  async hallOfFame(userId: string) {
    const rows = await fetchResults(userId);
    const overall = rank(rows).standings;
    const podium = overall.filter((s) => s.wins > 0).slice(0, 3);
    // Show each person by the same name everywhere (guests' latest spelling)
    const nameOf = new Map(overall.map((s) => [s.key, s.name]));

    const games = new Map<string, ParticipantResult[]>();
    for (const r of rows) games.set(r.game_id, [...(games.get(r.game_id) ?? []), r]);
    const champions = [...games.values()]
      .map((gameRows) => {
        const { standings, sessionCount } = rank(gameRows);
        const leaders = standings.filter((s) => s.rank === 1 && s.wins > 0);
        return { gameId: gameRows[0].game_id, gameName: gameRows[0].game_name, sessionCount, leaders };
      })
      .filter((c) => c.leaders.length > 0)
      .sort((a, b) => b.sessionCount - a.sessionCount || a.gameName.localeCompare(b.gameName));

    const victories: Victory[] = bySession(rows)
      .map((participants) => ({ participants, winners: winnersOf(participants) }))
      .filter(({ winners }) => winners.length > 0)
      .slice(-3)
      .reverse()
      .map(({ participants, winners }) => ({
        sessionId: participants[0].session_id,
        gameId: participants[0].game_id,
        gameName: participants[0].game_name,
        completedAt: participants[0].completed_at,
        winners: winners.map((w) => nameOf.get(personKey(w)) ?? w.display_name.trim()),
      }));

    return { podium, champions, victories };
  },
};
