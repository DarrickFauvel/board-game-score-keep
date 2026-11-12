import { db } from '../db/client.js';
import { processUploadedImage } from './imageService.js';

export const playerService = {
  async listAll() {
    const result = await db.execute('SELECT * FROM players ORDER BY display_name');
    return result.rows;
  },

  async search(q: string) {
    const result = await db.execute({
      sql: 'SELECT * FROM players WHERE display_name LIKE ? ORDER BY display_name LIMIT 20',
      args: [`%${q}%`],
    });
    return result.rows;
  },

  async findById(id: string) {
    const result = await db.execute({ sql: 'SELECT * FROM players WHERE id = ?', args: [id] });
    return result.rows[0] ?? null;
  },

  async findByUserId(userId: string) {
    const result = await db.execute({ sql: 'SELECT * FROM players WHERE user_id = ? LIMIT 1', args: [userId] });
    return result.rows[0] ?? null;
  },

  async getStats(playerId: string) {
    const result = await db.execute({
      sql: 'SELECT * FROM player_stats WHERE player_id = ?',
      args: [playerId],
    });
    if (result.rows.length === 0) return { games_played: 0, wins: 0, win_rate: 0 };
    const row = result.rows[0];
    const winRate = (row.games_played as number) > 0
      ? Math.round(((row.wins as number) / (row.games_played as number)) * 100)
      : 0;
    return { ...row, win_rate: winRate };
  },

  /**
   * The player's latest 50 sessions with their total, their finishing
   * position among everyone in that session (1 = best, ties share a rank,
   * by the game's win rule) and whether they won: the session is complete
   * and decided by the scoreboard's trophy rule (see winRule).
   */
  async getGameHistory(playerId: string) {
    const result = await db.execute({
      // Rank everyone in the player's sessions first, then keep the player's
      // rows: filtering first would leave one row per session, always rank 1.
      sql: `WITH totals AS (
              SELECT sp.id AS participant_id, sp.session_id, sp.player_id, sp.display_name,
                     COALESCE(SUM(se.value), 0) AS total
              FROM session_participants sp
              LEFT JOIN score_entries se ON se.participant_id = sp.id
              WHERE sp.session_id IN (SELECT session_id FROM session_participants WHERE player_id = ?)
              GROUP BY sp.id
            ),
            ranked AS (
              SELECT t.*,
                     RANK() OVER (
                       PARTITION BY t.session_id
                       ORDER BY CASE WHEN g.lowest_wins = 1 THEN t.total ELSE -t.total END
                     ) AS rank,
                     MAX(ABS(t.total)) OVER (PARTITION BY t.session_id) AS largest_total
              FROM totals t
              JOIN sessions s ON s.id = t.session_id
              JOIN games g ON g.id = s.game_id
            )
            SELECT
              s.id AS session_id,
              g.id AS game_id,
              g.name AS game_name,
              g.image_url,
              s.started_at,
              s.status,
              r.display_name,
              r.total AS total_score,
              r.rank,
              -- Decided as in winRule: highest wins needs a total above 0,
              -- lowest wins needs someone off 0
              CASE WHEN s.status = 'completed' AND r.rank = 1
                        AND (CASE WHEN g.lowest_wins = 1 THEN r.largest_total > 0 ELSE r.total > 0 END)
                   THEN 1 ELSE 0 END AS won
            FROM ranked r
            JOIN sessions s ON s.id = r.session_id
            JOIN games g ON g.id = s.game_id
            WHERE r.player_id = ?
            ORDER BY s.started_at DESC
            LIMIT 50`,
      args: [playerId, playerId],
    });
    return result.rows;
  },

  async update(id: string, body: Record<string, unknown>, file?: Express.Multer.File) {
    const avatarUrl = file
      ? await processUploadedImage(file.buffer, 'avatars')
      : ((body.avatar_url as string | undefined)?.trim() || undefined);
    await db.execute({
      sql: `UPDATE players SET
              display_name = ?,
              preferred_color = ?,
              preferred_token = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
              ${avatarUrl !== undefined ? ', avatar_url = ?' : ''}
            WHERE id = ?`,
      args: avatarUrl !== undefined
        ? [body.display_name as string, (body.preferred_color as string) || null, (body.preferred_token as string) || null, avatarUrl, id]
        : [body.display_name as string, (body.preferred_color as string) || null, (body.preferred_token as string) || null, id],
    });
  },
};
