import { db } from '../db/client.js';
import type { Row } from '@libsql/client';

export const teamService = {
  async listByGame(gameId: string) {
    const teams = await db.execute({
      sql: 'SELECT * FROM teams WHERE game_id = ? ORDER BY name',
      args: [gameId],
    });
    const members = await db.execute({
      sql: `SELECT tm.team_id, p.id, p.display_name, p.avatar_url, p.preferred_color
            FROM team_members tm
            JOIN players p ON p.id = tm.player_id
            WHERE tm.team_id IN (SELECT id FROM teams WHERE game_id = ?)`,
      args: [gameId],
    });

    const memberMap: Record<string, Row[]> = {};
    for (const m of members.rows) {
      const teamId = m.team_id as string;
      if (!memberMap[teamId]) memberMap[teamId] = [];
      memberMap[teamId].push(m);
    }

    return teams.rows.map(t => ({ ...t, members: memberMap[t.id as string] ?? [] }));
  },

  async create(gameId: string, body: Record<string, unknown>) {
    const result = await db.execute({
      sql: 'INSERT INTO teams (game_id, name, color) VALUES (?, ?, ?) RETURNING *',
      args: [gameId, body.name as string, (body.color as string) || null],
    });
    const team = result.rows[0];

    if (body.player_ids) {
      const ids = Array.isArray(body.player_ids) ? body.player_ids : [body.player_ids];
      for (const pid of ids) {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO team_members (team_id, player_id) VALUES (?, ?)',
          args: [team.id, pid as string],
        });
      }
    }

    return team;
  },

  async update(id: string, body: Record<string, unknown>) {
    await db.execute({
      sql: 'UPDATE teams SET name = ?, color = ? WHERE id = ?',
      args: [body.name as string, (body.color as string) || null, id],
    });
    if (body.player_ids !== undefined) {
      await db.execute({ sql: 'DELETE FROM team_members WHERE team_id = ?', args: [id] });
      const ids = Array.isArray(body.player_ids) ? body.player_ids : (body.player_ids ? [body.player_ids] : []);
      for (const pid of ids) {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO team_members (team_id, player_id) VALUES (?, ?)',
          args: [id, pid as string],
        });
      }
    }
  },

  async remove(id: string) {
    await db.execute({ sql: 'DELETE FROM teams WHERE id = ?', args: [id] });
  },
};
