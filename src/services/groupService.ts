import { randomBytes } from 'node:crypto';
import { db } from '../db/client.js';
import { isRole, type GroupRole } from './groupAccess.js';

export interface GroupSummary {
  id: string;
  name: string;
  role: GroupRole;
  member_count: number;
  game_count: number;
}

/** A change refused for a reason the person should see (e.g. the last owner leaving). */
export class GroupError extends Error {}

export const groupService = {
  /** The user's groups with their role, oldest membership first (their own group usually leads). */
  async listForUser(userId: string): Promise<GroupSummary[]> {
    const r = await db.execute({
      sql: `SELECT g.id, g.name, gm.role,
                   (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
                   (SELECT COUNT(*) FROM games WHERE group_id = g.id) AS game_count
            FROM group_members gm
            JOIN groups g ON g.id = gm.group_id
            WHERE gm.user_id = ?
            ORDER BY gm.joined_at, g.name`,
      args: [userId],
    });
    return r.rows.map((row) => ({
      id: String(row.id), name: String(row.name), role: row.role as GroupRole,
      member_count: Number(row.member_count), game_count: Number(row.game_count),
    }));
  },

  async findById(groupId: string) {
    const r = await db.execute({ sql: 'SELECT * FROM groups WHERE id = ?', args: [groupId] });
    return r.rows[0] ?? null;
  },

  /** A new group with its creator as owner. */
  async create(userId: string, name: string) {
    const r = await db.execute({
      sql: 'INSERT INTO groups (name, created_by) VALUES (?, ?) RETURNING *',
      args: [name.trim(), userId],
    });
    const group = r.rows[0];
    await db.execute({
      sql: "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')",
      args: [group.id, userId],
    });
    return group;
  },

  /** Every account has at least one group; makes "<name>'s games" if they have none. */
  async ensureOwnGroup(userId: string, playerName: string) {
    const existing = await this.listForUser(userId);
    if (existing.length) return existing[0];
    const group = await this.create(userId, `${playerName.trim() || 'My'}'s games`);
    return { id: String(group.id), name: String(group.name), role: 'owner' as GroupRole, member_count: 1, game_count: 0 };
  },

  async rename(groupId: string, name: string) {
    await db.execute({ sql: 'UPDATE groups SET name = ? WHERE id = ?', args: [name.trim(), groupId] });
  },

  /** Deletes the group with its games, sessions and scores (cascades). */
  async remove(groupId: string) {
    await db.execute({ sql: 'DELETE FROM groups WHERE id = ?', args: [groupId] });
  },

  /** Members with their player profile, owners first. */
  async members(groupId: string) {
    const r = await db.execute({
      sql: `SELECT gm.user_id, gm.role, gm.joined_at,
                   p.id AS player_id, p.display_name, p.avatar_url, p.preferred_color
            FROM group_members gm
            LEFT JOIN players p ON p.user_id = gm.user_id
            WHERE gm.group_id = ?
            ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'organizer' THEN 1 ELSE 2 END, p.display_name`,
      args: [groupId],
    });
    return r.rows;
  },

  async ownerCount(groupId: string) {
    const r = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM group_members WHERE group_id = ? AND role = 'owner'",
      args: [groupId],
    });
    return Number(r.rows[0].n);
  },

  /** Change a member's role. A group always keeps at least one owner. */
  async setRole(groupId: string, userId: string, role: unknown) {
    if (!isRole(role)) throw new GroupError('Pick Owner, Organizer or Player.');
    const current = await db.execute({
      sql: 'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      args: [groupId, userId],
    });
    if (!current.rows.length) throw new GroupError("That person isn't in this group any more.");
    if (current.rows[0].role === 'owner' && role !== 'owner' && await this.ownerCount(groupId) <= 1) {
      throw new GroupError('Every group needs an owner. Make someone else an owner first.');
    }
    await db.execute({
      sql: 'UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?',
      args: [role, groupId, userId],
    });
  },

  /** Remove a member (or leave). The last owner can't go. */
  async removeMember(groupId: string, userId: string) {
    const current = await db.execute({
      sql: 'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      args: [groupId, userId],
    });
    if (!current.rows.length) return;
    if (current.rows[0].role === 'owner' && await this.ownerCount(groupId) <= 1) {
      throw new GroupError('Every group needs an owner. Make someone else an owner first, or delete the group.');
    }
    await db.execute({ sql: 'DELETE FROM group_members WHERE group_id = ? AND user_id = ?', args: [groupId, userId] });
  },

  /** Add someone as a Player; nothing changes if they're already in. */
  async addMember(groupId: string, userId: string) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'player')",
      args: [groupId, userId],
    });
  },

  /* ─── Invites ───────────────────────────────────────── */

  async ensureInviteCode(groupId: string): Promise<string> {
    const current = (await this.findById(groupId))?.invite_code as string | null | undefined;
    if (current) return current;
    await db.execute({
      sql: 'UPDATE groups SET invite_code = ? WHERE id = ? AND invite_code IS NULL',
      args: [randomBytes(16).toString('base64url'), groupId],
    });
    return (await this.findById(groupId))!.invite_code as string;
  },

  /** Replace the invite code so old links stop working. */
  async resetInviteCode(groupId: string) {
    await db.execute({
      sql: 'UPDATE groups SET invite_code = ? WHERE id = ?',
      args: [randomBytes(16).toString('base64url'), groupId],
    });
  },

  async findByInviteCode(code: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
    const r = await db.execute({
      sql: `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
            FROM groups g WHERE g.invite_code = ?`,
      args: [code],
    });
    return r.rows[0] ?? null;
  },
};
