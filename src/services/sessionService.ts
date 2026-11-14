import { randomBytes } from 'node:crypto';
import { db } from '../db/client.js';
import { processUploadedImage } from './imageService.js';
import { standingsService } from './standingsService.js';
import { gameUnits } from './units.js';
import { winRule } from './winRule.js';

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

  /* ─── Invites ───────────────────────────────────────── */

  /** The session's invite code, creating it the first time it's needed. */
  async ensureInviteCode(sessionId: string): Promise<string> {
    const existing = await db.execute({ sql: 'SELECT invite_code FROM sessions WHERE id = ?', args: [sessionId] });
    const current = existing.rows[0]?.invite_code as string | null | undefined;
    if (current) return current;
    const code = randomBytes(16).toString('base64url');
    // Only set it if still empty, so two tabs opening at once agree on one code
    await db.execute({
      sql: 'UPDATE sessions SET invite_code = ? WHERE id = ? AND invite_code IS NULL',
      args: [code, sessionId],
    });
    const after = await db.execute({ sql: 'SELECT invite_code FROM sessions WHERE id = ?', args: [sessionId] });
    return after.rows[0].invite_code as string;
  },

  /** A session by its invite code, with its game and host's name. */
  async findByInviteCode(code: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
    const result = await db.execute({
      sql: `SELECT s.*, g.name AS game_name, s.created_by AS host_user_id,
                   (SELECT display_name FROM players WHERE user_id = s.created_by LIMIT 1) AS host_name
            FROM sessions s
            JOIN games g ON g.id = s.game_id
            WHERE s.invite_code = ?`,
      args: [code],
    });
    return result.rows[0] ?? null;
  },

  /** Unlinked guests in the session whose name matches, ignoring capitals and spacing. */
  async guestsNamed(sessionId: string, name: string) {
    const result = await db.execute({
      sql: `SELECT * FROM session_participants
            WHERE session_id = ? AND player_id IS NULL AND team_id IS NULL
            ORDER BY sort_order`,
      args: [sessionId],
    });
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    return result.rows.filter((r) => norm(String(r.display_name)) === norm(name));
  },

  /**
   * Link an unlinked guest spot to a player, keeping its scores. False if the
   * spot isn't an unlinked guest in this session (e.g. someone claimed it first).
   */
  async claimGuest(sessionId: string, participantId: string, playerId: string): Promise<boolean> {
    const result = await db.execute({
      // Take the player's own spelling of their name too ("kit" becomes "Kit")
      sql: `UPDATE session_participants
            SET player_id = ?, display_name = COALESCE((SELECT display_name FROM players WHERE id = ?), display_name)
            WHERE id = ? AND session_id = ? AND player_id IS NULL AND team_id IS NULL
            RETURNING id`,
      args: [playerId, playerId, participantId, sessionId],
    });
    return result.rows.length > 0;
  },

  /** Add a player at the end of the session's list. */
  async addPlayer(sessionId: string, player: { id: string; display_name: string; preferred_color: string | null }) {
    await db.execute({
      sql: `INSERT INTO session_participants (session_id, player_id, display_name, color, sort_order)
            VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM session_participants WHERE session_id = ?))`,
      args: [sessionId, player.id, player.display_name, player.preferred_color, sessionId],
    });
  },

  /** Sessions the user plays in but doesn't host: active first, then the latest finished. */
  async listJoined(userId: string) {
    const result = await db.execute({
      sql: `SELECT s.id, s.game_id, s.status, s.started_at, s.completed_at,
                   g.name AS game_name, g.image_url AS game_image,
                   (SELECT display_name FROM players WHERE user_id = s.created_by LIMIT 1) AS host_name
            FROM sessions s
            JOIN games g ON g.id = s.game_id
            -- Sessions of groups you're not in, that you joined through an invite
            WHERE g.group_id NOT IN (SELECT group_id FROM group_members WHERE user_id = ?)
              AND EXISTS (
                SELECT 1 FROM session_participants sp
                JOIN players p ON p.id = sp.player_id
                WHERE sp.session_id = s.id AND p.user_id = ?
              )
            ORDER BY s.status = 'active' DESC, COALESCE(s.completed_at, s.started_at) DESC
            LIMIT 12`,
      args: [userId, userId],
    });
    return result.rows;
  },

  async create(
    gameId: string, userId: string, body: Record<string, unknown>,
    plannedRounds: number | null = null, targetScore: number | null = null,
  ) {
    const result = await db.execute({
      // rounds_closed = 0: rounds advance only when someone taps Next Round
      sql: 'INSERT INTO sessions (game_id, created_by, planned_rounds, target_score, rounds_closed) VALUES (?, ?, ?, ?, 0) RETURNING *',
      args: [gameId, userId, plannedRounds, targetScore],
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

  /**
   * Who won, for the victory celebration: everyone tied on the winning total
   * (the scoreboard's trophy rule, see winRule). No winners while the game is
   * undecided. Each winner carries their record in this game (see
   * standingsService.winnerFacts) once the session is completed.
   */
  async getCelebration(sessionId: string) {
    const result = await db.execute({
      sql: `SELECT s.game_id, g.group_id, g.name AS game_name, g.point_name, g.lowest_wins, sp.id, sp.display_name, sp.color, p.preferred_color,
                   COALESCE(SUM(se.value), 0) AS total
            FROM session_participants sp
            JOIN sessions s ON s.id = sp.session_id
            JOIN games g ON g.id = s.game_id
            LEFT JOIN players p ON p.id = sp.player_id
            LEFT JOIN score_entries se ON se.participant_id = sp.id
            WHERE sp.session_id = ?
            GROUP BY sp.id
            ORDER BY sp.sort_order`,
      args: [sessionId],
    });
    const rows = (result.rows as unknown as {
      game_id: string; group_id: string; game_name: string; point_name: string | null; lowest_wins: number; id: string; display_name: string; color: string | null; preferred_color: string | null; total: number;
    }[]).map((r) => ({ ...r, total: Number(r.total) }));
    const top = winRule(rows[0]).winningTotal(rows.map((r) => r.total));
    const facts = top !== null
      // Streaks and records come from the session's group, so every phone tells the same story
      ? await standingsService.winnerFacts(rows[0].group_id, rows[0].game_id, sessionId)
      : new Map();
    return {
      gameName: rows[0]?.game_name ?? '',
      score: top ?? 0,
      scoreLabel: gameUnits(rows[0]).pointCount(top ?? 0),  // "7 victory points"
      winners: top !== null
        ? rows.filter((r) => r.total === top).map((r) => ({
            name: r.display_name,
            color: r.color ?? r.preferred_color ?? null,
            facts: facts.get(r.id) ?? null,
          }))
        : [],
    };
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
