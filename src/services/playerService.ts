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

  async getGameHistory(playerId: string) {
    const result = await db.execute({
      sql: `SELECT
              s.id AS session_id,
              g.id AS game_id,
              g.name AS game_name,
              g.image_url,
              s.started_at,
              s.status,
              sp.display_name,
              SUM(se.value) AS total_score,
              RANK() OVER (PARTITION BY s.id ORDER BY SUM(se.value) DESC) AS rank
            FROM session_participants sp
            JOIN sessions s ON s.id = sp.session_id
            JOIN games g ON g.id = s.game_id
            LEFT JOIN score_entries se ON se.participant_id = sp.id
            WHERE sp.player_id = ?
            GROUP BY sp.id, s.id
            ORDER BY s.started_at DESC
            LIMIT 50`,
      args: [playerId],
    });
    return result.rows;
  },

  async update(id: string, body: Record<string, unknown>, file?: Express.Multer.File) {
    const avatarUrl = file
      ? await processUploadedImage(file.path, 'avatars')
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
