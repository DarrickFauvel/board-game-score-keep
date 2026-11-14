import { db } from '../db/client.js';
import type { Row } from '@libsql/client';

/**
 * Who may do what in a session:
 * - host: owns the session's game. Can do everything, including completing
 *   and deleting the session.
 * - player: joined the session as a linked player (through an invite, or
 *   added by the host). Can view it, enter anyone's scores, and add photos
 *   and notes.
 */
export type SessionRole = 'host' | 'player';

export interface SessionAccess {
  session: Row;
  game: Row;
  role: SessionRole;
}

/**
 * The session and game with the user's role in it, or null when the user has
 * no part in it (or `gameId` doesn't match the session's game). Routes answer
 * null with a 404, so a session's existence isn't revealed to outsiders.
 */
export async function sessionAccess(sessionId: string, userId: string, gameId?: string): Promise<SessionAccess | null> {
  const result = await db.execute({
    sql: `SELECT s.*, g.owner_id AS game_owner_id,
                 EXISTS (
                   SELECT 1 FROM session_participants sp
                   JOIN players p ON p.id = sp.player_id
                   WHERE sp.session_id = s.id AND p.user_id = ?
                 ) AS is_player
          FROM sessions s
          JOIN games g ON g.id = s.game_id
          WHERE s.id = ?`,
    args: [userId, sessionId],
  });
  const session = result.rows[0];
  if (!session) return null;
  if (gameId && session.game_id !== gameId) return null;

  const role: SessionRole | null =
    session.game_owner_id === userId ? 'host' : Number(session.is_player) ? 'player' : null;
  if (!role) return null;

  const game = (await db.execute({ sql: 'SELECT * FROM games WHERE id = ?', args: [session.game_id] })).rows[0];
  return { session, game, role };
}

/** Same as sessionAccess, but only the host gets through. */
export async function hostAccess(sessionId: string, userId: string, gameId?: string): Promise<SessionAccess | null> {
  const access = await sessionAccess(sessionId, userId, gameId);
  return access?.role === 'host' ? access : null;
}
