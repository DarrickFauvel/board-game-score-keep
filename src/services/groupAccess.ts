import { db } from '../db/client.js';

/**
 * Who does what in a group. One table, so every page and route agrees:
 *
 *   player     see the group, start sessions, enter scores, add photos and notes,
 *              complete sessions they started
 *   organizer  + add and edit games, manage guests, complete and delete any
 *              session, delete photos, invite people
 *   owner      + change roles, remove members, rename and delete the group
 */
export type GroupRole = 'owner' | 'organizer' | 'player';

export type GroupAction =
  | 'view' | 'play'
  | 'manageGames' | 'manageGuests' | 'manageSessions' | 'invite'
  | 'manageMembers' | 'manageGroup';

const RANK: Record<GroupRole, number> = { player: 1, organizer: 2, owner: 3 };

const NEEDS: Record<GroupAction, GroupRole> = {
  view: 'player',
  play: 'player',
  manageGames: 'organizer',
  manageGuests: 'organizer',
  manageSessions: 'organizer',
  invite: 'organizer',
  manageMembers: 'owner',
  manageGroup: 'owner',
};

export const ROLE_LABEL: Record<GroupRole, string> = { owner: 'Owner', organizer: 'Organizer', player: 'Player' };

export function isRole(v: unknown): v is GroupRole {
  return v === 'owner' || v === 'organizer' || v === 'player';
}

/** Whether a member with this role may do the action. No role (not a member): never. */
export function can(role: GroupRole | null | undefined, action: GroupAction): boolean {
  return !!role && RANK[role] >= RANK[NEEDS[action]];
}

/** The user's role in the group, or null if they aren't a member. */
export async function groupRole(groupId: string | null | undefined, userId: string): Promise<GroupRole | null> {
  if (!groupId) return null;
  const r = await db.execute({
    sql: 'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [groupId, userId],
  });
  const role = r.rows[0]?.role;
  return isRole(role) ? role : null;
}
