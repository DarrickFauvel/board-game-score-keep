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

  async create(gameId: string, userId: string, body: Record<string, unknown>, plannedRounds: number | null = null) {
    const result = await db.execute({
      sql: 'INSERT INTO sessions (game_id, created_by, planned_rounds) VALUES (?, ?, ?) RETURNING *',
      args: [gameId, userId, plannedRounds],
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

  /** Uploads one photo; returns the new row, or null if there was nothing to upload. */
  async addPhoto(sessionId: string, file?: Express.Multer.File, cameraData?: string) {
    let photoUrl: string | undefined;
    if (file) {
      photoUrl = await processUploadedImage(file.buffer, 'sessions');
    } else if (cameraData?.startsWith('data:image/')) {
      photoUrl = await processUploadedImage(cameraData, 'sessions');
    }
    if (!photoUrl) return null;
    const result = await db.execute({
      sql: 'INSERT INTO session_photos (session_id, photo_url) VALUES (?, ?) RETURNING *',
      args: [sessionId, photoUrl],
    });
    return result.rows[0];
  },

  /** Photos with their caption and the ids of the participants tagged in each. */
  async listPhotos(sessionId: string) {
    const [photos, tags] = await Promise.all([
      db.execute({
        sql: 'SELECT * FROM session_photos WHERE session_id = ? ORDER BY created_at',
        args: [sessionId],
      }),
      db.execute({
        sql: `SELECT spp.photo_id, spp.participant_id
              FROM session_photo_participants spp
              JOIN session_photos ph ON ph.id = spp.photo_id
              WHERE ph.session_id = ?`,
        args: [sessionId],
      }),
    ]);
    return photos.rows.map((photo) => ({
      ...photo,
      participant_ids: tags.rows
        .filter((t) => t.photo_id === photo.id)
        .map((t) => String(t.participant_id)),
    }));
  },

  /** Sets a photo's caption and who was playing; participants outside the session are ignored. */
  async updatePhoto(sessionId: string, photoId: string, caption: string | undefined, participantIds: string[]) {
    const owned = await db.execute({
      sql: 'SELECT id FROM session_photos WHERE id = ? AND session_id = ?',
      args: [photoId, sessionId],
    });
    if (owned.rows.length === 0) return false;
    await db.batch([
      {
        sql: 'UPDATE session_photos SET caption = ? WHERE id = ?',
        args: [caption?.trim() || null, photoId],
      },
      { sql: 'DELETE FROM session_photo_participants WHERE photo_id = ?', args: [photoId] },
      ...participantIds.map((participantId) => ({
        sql: `INSERT OR IGNORE INTO session_photo_participants (photo_id, participant_id)
              SELECT ?, id FROM session_participants WHERE id = ? AND session_id = ?`,
        args: [photoId, participantId, sessionId],
      })),
    ], 'write');
    return true;
  },

  async removePhoto(sessionId: string, photoId: string) {
    await db.batch([
      {
        sql: `DELETE FROM session_photo_participants
              WHERE photo_id IN (SELECT id FROM session_photos WHERE id = ? AND session_id = ?)`,
        args: [photoId, sessionId],
      },
      { sql: 'DELETE FROM session_photos WHERE id = ? AND session_id = ?', args: [photoId, sessionId] },
    ], 'write');
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
