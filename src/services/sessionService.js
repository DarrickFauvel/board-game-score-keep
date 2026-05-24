import { db } from '../db/client.js';
import { processUploadedImage } from './imageService.js';

export const sessionService = {
  async listByGame(gameId) {
    const result = await db.execute({
      sql: `SELECT s.*,
              (SELECT COUNT(*) FROM session_participants WHERE session_id = s.id) AS participant_count
            FROM sessions s
            WHERE s.game_id = ?
            ORDER BY s.started_at DESC`,
      args: [gameId],
    });
    return result.rows;
  },

  async findById(id) {
    const result = await db.execute({
      sql: 'SELECT * FROM sessions WHERE id = ?',
      args: [id],
    });
    return result.rows[0] ?? null;
  },

  async create(gameId, userId, body) {
    const result = await db.execute({
      sql: 'INSERT INTO sessions (game_id, created_by) VALUES (?, ?) RETURNING *',
      args: [gameId, userId],
    });
    const session = result.rows[0];

    const participants = parseParticipants(body);
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      await db.execute({
        sql: `INSERT INTO session_participants
                (session_id, player_id, team_id, display_name, color, sort_order)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [session.id, p.player_id ?? null, p.team_id ?? null, p.display_name, p.color ?? null, i],
      });
    }

    return session;
  },

  async listParticipants(sessionId) {
    const result = await db.execute({
      sql: `SELECT sp.*, p.avatar_url, p.preferred_color
            FROM session_participants sp
            LEFT JOIN players p ON p.id = sp.player_id
            WHERE sp.session_id = ?
            ORDER BY sp.sort_order`,
      args: [sessionId],
    });
    return result.rows;
  },

  async complete(id) {
    await db.execute({
      sql: `UPDATE sessions SET status = 'completed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ?`,
      args: [id],
    });
  },

  async saveNote(id, note, file) {
    const photoUrl = file ? await processUploadedImage(file.path, 'sessions') : undefined;
    await db.execute({
      sql: `UPDATE sessions SET note = ?,
              ${photoUrl !== undefined ? 'photo_url = ?,' : ''}
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ?`,
      args: photoUrl !== undefined ? [note ?? null, photoUrl, id] : [note ?? null, id],
    });
  },

  async remove(id) {
    await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [id] });
  },
};

function parseParticipants(body) {
  const names = Array.isArray(body.display_name) ? body.display_name : (body.display_name ? [body.display_name] : []);
  const playerIds = Array.isArray(body.player_id) ? body.player_id : (body.player_id ? [body.player_id] : []);
  const teamIds = Array.isArray(body.team_id) ? body.team_id : (body.team_id ? [body.team_id] : []);
  const colors = Array.isArray(body.color) ? body.color : (body.color ? [body.color] : []);

  return names.map((name, i) => ({
    display_name: name,
    player_id: playerIds[i] || null,
    team_id: teamIds[i] || null,
    color: colors[i] || null,
  })).filter(p => p.display_name.trim());
}
