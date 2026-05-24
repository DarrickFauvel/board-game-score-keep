import { db } from '../db/client.js';

export const scoreService = {
  async listCategories(gameId) {
    const result = await db.execute({
      sql: 'SELECT * FROM score_categories WHERE game_id = ? ORDER BY sort_order',
      args: [gameId],
    });
    return result.rows;
  },

  async getSessionScores(sessionId) {
    const result = await db.execute({
      sql: `SELECT se.*, sc.name AS category_name
            FROM score_entries se
            LEFT JOIN score_categories sc ON sc.id = se.category_id
            WHERE se.session_id = ?
            ORDER BY se.participant_id, se.round, se.category_id`,
      args: [sessionId],
    });
    return result.rows;
  },

  async upsertEntry(sessionId, body, userId) {
    const { participant_id, value, category_id, round } = body;

    const existing = await db.execute({
      sql: `SELECT id FROM score_entries
            WHERE session_id = ? AND participant_id = ?
              AND (category_id IS ? OR (category_id IS NULL AND ? IS NULL))
              AND (round IS ? OR (round IS NULL AND ? IS NULL))
            LIMIT 1`,
      args: [sessionId, participant_id, category_id ?? null, category_id ?? null, round ?? null, round ?? null],
    });

    if (existing.rows.length > 0) {
      await db.execute({
        sql: 'UPDATE score_entries SET value = ?, entered_by = ?, entered_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?',
        args: [parseFloat(value), userId, existing.rows[0].id],
      });
      return { ...existing.rows[0], value: parseFloat(value), participant_id, session_id: sessionId, category_id: category_id ?? null, round: round ?? null };
    }

    const result = await db.execute({
      sql: `INSERT INTO score_entries (session_id, participant_id, category_id, round, value, entered_by)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [sessionId, participant_id, category_id ?? null, round ?? null, parseFloat(value), userId],
    });
    return result.rows[0];
  },

  async removeEntry(entryId) {
    await db.execute({ sql: 'DELETE FROM score_entries WHERE id = ?', args: [entryId] });
  },

  async getParticipantTotals(sessionId) {
    const result = await db.execute({
      sql: `SELECT participant_id, SUM(value) AS total
            FROM score_entries
            WHERE session_id = ?
            GROUP BY participant_id`,
      args: [sessionId],
    });
    return result.rows;
  },
};
