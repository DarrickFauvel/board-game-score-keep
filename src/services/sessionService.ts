import { db } from '../db/client.js';
import { processUploadedImage } from './imageService.js';

interface ParticipantInput {
  display_name: string;
  player_id: string | null;
  team_id: string | null;
  color: string | null;
}

export const sessionService = {
  async listByGame(gameId: string) {
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

  async findById(id: string) {
    const result = await db.execute({
      sql: 'SELECT * FROM sessions WHERE id = ?',
      args: [id],
    });
    return result.rows[0] ?? null;
  },

  async create(gameId: string, userId: string, body: Record<string, unknown>) {
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

  async listParticipants(sessionId: string) {
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

  async complete(id: string) {
    await db.execute({
      sql: `UPDATE sessions SET status = 'completed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ?`,
      args: [id],
    });
  },

  async saveNote(id: string, note: string | undefined) {
    await db.execute({
      sql: `UPDATE sessions SET note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      args: [note ?? null, id],
    });
  },

  async addPhoto(sessionId: string, file?: Express.Multer.File, cameraData?: string): Promise<void> {
    let photoUrl: string | undefined;
    if (file) {
      photoUrl = await processUploadedImage(file.buffer, 'sessions');
    } else if (cameraData?.startsWith('data:image/')) {
      photoUrl = await processUploadedImage(cameraData, 'sessions');
    }
    if (!photoUrl) return;
    await db.execute({
      sql: 'INSERT INTO session_photos (session_id, photo_url) VALUES (?, ?)',
      args: [sessionId, photoUrl],
    });
  },

  async listPhotos(sessionId: string) {
    const result = await db.execute({
      sql: 'SELECT * FROM session_photos WHERE session_id = ? ORDER BY created_at',
      args: [sessionId],
    });
    return result.rows;
  },

  async removePhoto(photoId: string) {
    await db.execute({ sql: 'DELETE FROM session_photos WHERE id = ?', args: [photoId] });
  },

  async remove(id: string) {
    await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [id] });
  },
};

function parseParticipants(body: Record<string, unknown>): ParticipantInput[] {
  const names = Array.isArray(body.display_name) ? body.display_name : (body.display_name ? [body.display_name] : []);
  const playerIds = Array.isArray(body.player_id) ? body.player_id : (body.player_id ? [body.player_id] : []);
  const teamIds = Array.isArray(body.team_id) ? body.team_id : (body.team_id ? [body.team_id] : []);
  const colors = Array.isArray(body.color) ? body.color : (body.color ? [body.color] : []);

  return (names as string[]).map((name, i) => ({
    display_name: name,
    player_id: (playerIds[i] as string) || null,
    team_id: (teamIds[i] as string) || null,
    color: (colors[i] as string) || null,
  })).filter(p => p.display_name.trim());
}
