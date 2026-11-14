import { db } from '../db/client.js';
import type { Row } from '@libsql/client';
import { can, isRole, type GroupRole } from './groupAccess.js';

/**
 * Who may do what in a session:
 * - host: an organizer or owner of the game's group. Can do everything,
 *   including deleting the session and its photos.
 * - player: a group Player, or someone who joined this one session through
 *   an invite. Can view it, enter anyone's scores, and add photos and notes.
 *
 * Whoever started a session may also complete it (canComplete), so a Player
 * running game night can finish their own game.
 */
export type SessionRole = 'host' | 'player';

export interface SessionAccess {
  session: Row;
  game: Row;
  role: SessionRole;
  /** The user's role in the game's group; null for invited outsiders */
  groupRole: GroupRole | null;
  canComplete: boolean;
}

/**
 * The session and game with the user's role in it, or null when the user has
 * no part in it (or `gameId` doesn't match the session's game). Routes answer
 * null with a 404, so a session's existence isn't revealed to outsiders.
 */
export async function sessionAccess(sessionId: string, userId: string, gameId?: string): Promise<SessionAccess | null> {
  const result = await db.execute({
    sql: `SELECT s.*,
                 (SELECT role FROM group_members gm WHERE gm.group_id = g.group_id AND gm.user_id = ?) AS group_role,
                 EXISTS (
                   SELECT 1 FROM session_participants sp
                   JOIN players p ON p.id = sp.player_id
                   WHERE sp.session_id = s.id AND p.user_id = ?
                 ) AS is_player
          FROM sessions s
          JOIN games g ON g.id = s.game_id
          WHERE s.id = ?`,
    args: [userId, userId, sessionId],
  });
  const session = result.rows[0];
  if (!session) return null;
  if (gameId && session.game_id !== gameId) return null;

  const groupRole = isRole(session.group_role) ? session.group_role : null;
  const role: SessionRole | null = can(groupRole, 'manageSessions')
    ? 'host'
    : groupRole || Number(session.is_player) ? 'player' : null;
  if (!role) return null;

  const game = (await db.execute({ sql: 'SELECT * FROM games WHERE id = ?', args: [session.game_id] })).rows[0];
  return { session, game, role, groupRole, canComplete: role === 'host' || session.created_by === userId };
}

/** Same as sessionAccess, but only the host gets through. */
export async function hostAccess(sessionId: string, userId: string, gameId?: string): Promise<SessionAccess | null> {
  const access = await sessionAccess(sessionId, userId, gameId);
  return access?.role === 'host' ? access : null;
}
