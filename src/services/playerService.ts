import { db } from '../db/client.js';
import { processUploadedImage, parseCrop, splitImageRef, withCrop } from './imageService.js';
import { can, groupRole } from './groupAccess.js';

/**
 * Sessions the user can see: their groups' games, plus single sessions they
 * joined through an invite. Takes the user id twice.
 */
const ACCESSIBLE_SESSIONS = `
  SELECT s.id FROM sessions s JOIN games g ON g.id = s.game_id
  WHERE g.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
     OR EXISTS (SELECT 1 FROM session_participants sp JOIN players p ON p.id = sp.player_id
                WHERE sp.session_id = s.id AND p.user_id = ?)`;

/** How a player relates to the person looking. */
export type PlayerKind = 'member' | 'guest' | 'played';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export const playerService = {
  /**
   * The players the user may pick for a session in this group, or see on the
   * Players page; never every account in the app:
   *   member  people in the group (accounts), the user included
   *   guest   the group's guests (no account); hidden ones only if asked
   *   played  other accounts the user has shared a session with
   */
  async listVisible(userId: string, groupId: string, opts: { includeHidden?: boolean } = {}) {
    const result = await db.execute({
      sql: `SELECT p.*, 'member' AS kind FROM players p
              WHERE p.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)
            UNION ALL
            SELECT p.*, 'guest' AS kind FROM players p
              WHERE p.group_id = ? AND p.user_id IS NULL ${opts.includeHidden ? '' : 'AND p.hidden_at IS NULL'}
            UNION ALL
            SELECT p.*, 'played' AS kind FROM players p
              WHERE p.user_id IS NOT NULL
                AND p.user_id NOT IN (SELECT user_id FROM group_members WHERE group_id = ?)
                AND p.id IN (SELECT player_id FROM session_participants WHERE session_id IN (${ACCESSIBLE_SESSIONS}))
            ORDER BY display_name COLLATE NOCASE`,
      args: [groupId, groupId, groupId, userId, userId],
    });
    return result.rows;
  },

  /**
   * Whether the user may open this player's profile: themselves, anyone in
   * one of their groups (members and guests), or anyone in a session they
   * can see. Outsiders get a 404.
   */
  async canView(playerId: string, userId: string): Promise<boolean> {
    const result = await db.execute({
      sql: `SELECT 1 FROM players p
            WHERE p.id = ? AND (
              p.user_id = ?
              OR p.user_id IN (SELECT gm.user_id FROM group_members gm
                               WHERE gm.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?))
              OR p.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
              OR p.id IN (SELECT player_id FROM session_participants WHERE session_id IN (${ACCESSIBLE_SESSIONS}))
            )`,
      args: [playerId, userId, userId, userId, userId, userId],
    });
    return result.rows.length > 0;
  },

  /** Your own profile, or a guest of a group where you can manage guests. */
  async canEdit(player: Record<string, unknown>, userId: string): Promise<boolean> {
    if (player.user_id) return player.user_id === userId;
    return can(await groupRole(player.group_id as string | null, userId), 'manageGuests');
  },

  /** The group's guest with this name (ignoring capitals and spacing), if any. */
  async findGuest(groupId: string, name: string) {
    const result = await db.execute({
      sql: `SELECT * FROM players WHERE group_id = ? AND user_id IS NULL
              AND lower(trim(display_name)) = lower(trim(?))`,
      args: [groupId, name.replace(/\s+/g, ' ')],
    });
    return result.rows[0] ?? null;
  },

  /**
   * The group's guest with this name, created if new. Names are unique per
   * group, so typing "Sam" again always means the same Sam.
   */
  async findOrCreateGuest(groupId: string, name: string, color: string | null) {
    const clean = name.trim().replace(/\s+/g, ' ');
    const existing = await this.findGuest(groupId, clean);
    if (existing) return existing;
    try {
      const result = await db.execute({
        sql: 'INSERT INTO players (group_id, display_name, preferred_color) VALUES (?, ?, ?) RETURNING *',
        args: [groupId, clean, color],
      });
      return result.rows[0];
    } catch (err) {
      // Someone added the same guest a moment ago: use theirs
      const raced = await this.findGuest(groupId, clean);
      if (raced) return raced;
      throw err;
    }
  },

  /**
   * The group's guests for the manage page, hidden ones included, with how
   * many sessions each has played.
   */
  async listGuestsForManage(groupId: string) {
    const result = await db.execute({
      sql: `SELECT p.*, (SELECT COUNT(DISTINCT sp.session_id) FROM session_participants sp WHERE sp.player_id = p.id) AS sessions
            FROM players p
            WHERE p.group_id = ? AND p.user_id IS NULL
            ORDER BY p.hidden_at IS NOT NULL, p.display_name COLLATE NOCASE`,
      args: [groupId],
    });
    return result.rows;
  },

  /** Hide a guest from suggestions (their history stays), or bring them back. */
  async setHidden(guestId: string, groupId: string, hidden: boolean) {
    const result = await db.execute({
      sql: `UPDATE players SET hidden_at = ${hidden ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : 'NULL'},
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ? AND group_id = ? AND user_id IS NULL`,
      args: [guestId, groupId],
    });
    return result.rowsAffected > 0;
  },

  /**
   * Merge one guest into another of the same group: every session row and
   * team membership moves to the target, old rows take the target's name, the
   * target picks up a colour or picture it lacks, and the source is deleted.
   * All in one transaction. Refused when both played in the same session,
   * since one person can't hold two seats.
   */
  async mergeGuests(sourceId: string, targetId: string, groupId: string): Promise<MergeResult> {
    if (sourceId === targetId) return { ok: false, reason: 'Pick a different guest to merge into.' };
    const guests = await db.execute({
      sql: 'SELECT * FROM players WHERE id IN (?, ?) AND group_id = ? AND user_id IS NULL',
      args: [sourceId, targetId, groupId],
    });
    const source = guests.rows.find((p) => p.id === sourceId);
    const target = guests.rows.find((p) => p.id === targetId);
    if (!source || !target) return { ok: false, reason: 'Both guests must belong to this group.' };

    const shared = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM session_participants a JOIN session_participants b ON a.session_id = b.session_id
            WHERE a.player_id = ? AND b.player_id = ?`,
      args: [sourceId, targetId],
    });
    if (Number(shared.rows[0].n) > 0) {
      return { ok: false, reason: `${source.display_name} and ${target.display_name} played in the same game, so they can't be the same person.` };
    }

    const moved = await db.execute({
      sql: 'SELECT COUNT(DISTINCT session_id) AS n FROM session_participants WHERE player_id = ?',
      args: [sourceId],
    });
    await db.batch([
      { sql: 'UPDATE session_participants SET player_id = ?, display_name = ? WHERE player_id = ?',
        args: [targetId, target.display_name, sourceId] },
      { sql: 'INSERT OR IGNORE INTO team_members (team_id, player_id) SELECT team_id, ? FROM team_members WHERE player_id = ?',
        args: [targetId, sourceId] },
      { sql: `UPDATE players SET
                preferred_color = COALESCE(preferred_color, ?),
                avatar_url = COALESCE(avatar_url, ?),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
              WHERE id = ?`,
        args: [source.preferred_color ?? null, source.avatar_url ?? null, targetId] },
      // Explicit, rather than trusting ON DELETE CASCADE with foreign keys possibly off
      { sql: 'DELETE FROM team_members WHERE player_id = ?', args: [sourceId] },
      { sql: 'DELETE FROM players WHERE id = ?', args: [sourceId] },
    ], 'write');
    return { ok: true, source: String(source.display_name), target: String(target.display_name), sessions: Number(moved.rows[0].n) };
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

  async update(id: string, body: Record<string, unknown>, file?: Express.Multer.File, currentAvatar?: string | null) {
    const avatarUrl = await resolveAvatar(body, file, currentAvatar ?? null);
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

/**
 * Work out the new avatar from what the avatar picker sent: an uploaded file,
 * a camera capture (data URL), or a pasted image URL, in that order. Every
 * source goes through Cloudinary untouched; the framing from the crop editor
 * is stored beside it, so re-cropping never needs a new upload.
 * Returns null to clear the avatar, or undefined to leave it unchanged.
 */
async function resolveAvatar(body: Record<string, unknown>, file: Express.Multer.File | undefined, current: string | null): Promise<string | null | undefined> {
  const crop = parseCrop(body.avatar_crop);

  if (file) return withCrop(await processUploadedImage(file.buffer, 'avatars'), crop);

  const camera = (body.avatar_camera_data as string | undefined)?.trim();
  if (camera?.startsWith('data:image/')) return withCrop(await processUploadedImage(camera, 'avatars'), crop);

  const url = (body.image_url as string | undefined)?.trim();
  if (url) {
    if (!/^https?:\/\//i.test(url)) throw new AvatarError('The image link must start with http:// or https://.');
    return withCrop(await processUploadedImage(url, 'avatars'), crop);
  }

  if (body.remove_avatar === '1') return null;

  // No new picture: re-frame the current one if the crop changed
  if (current && crop) {
    const next = withCrop(splitImageRef(current).ref, crop);
    return next === current ? undefined : next;
  }
  return undefined;
}

export type MergeResult =
  | { ok: true; source: string; target: string; sessions: number }
  | { ok: false; reason: string };

/** A problem with the avatar the person chose, safe to show them. */
export class AvatarError extends Error {}
