import { db } from '../db/client.js';

export const teamService = {
  async listByGame(gameId) {
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

    const memberMap = {};
    for (const m of members.rows) {
      if (!memberMap[m.team_id]) memberMap[m.team_id] = [];
      memberMap[m.team_id].push(m);
    }

    return teams.rows.map(t => ({ ...t, members: memberMap[t.id] ?? [] }));
  },

  async create(gameId, body) {
    const result = await db.execute({
      sql: 'INSERT INTO teams (game_id, name, color) VALUES (?, ?, ?) RETURNING *',
      args: [gameId, body.name, body.color || null],
    });
    const team = result.rows[0];

    if (body.player_ids) {
      const ids = Array.isArray(body.player_ids) ? body.player_ids : [body.player_ids];
      for (const pid of ids) {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO team_members (team_id, player_id) VALUES (?, ?)',
          args: [team.id, pid],
        });
      }
    }

    return team;
  },

  async update(id, body) {
    await db.execute({
      sql: 'UPDATE teams SET name = ?, color = ? WHERE id = ?',
      args: [body.name, body.color || null, id],
    });
    if (body.player_ids !== undefined) {
      await db.execute({ sql: 'DELETE FROM team_members WHERE team_id = ?', args: [id] });
      const ids = Array.isArray(body.player_ids) ? body.player_ids : (body.player_ids ? [body.player_ids] : []);
      for (const pid of ids) {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO team_members (team_id, player_id) VALUES (?, ?)',
          args: [id, pid],
        });
      }
    }
  },

  async remove(id) {
    await db.execute({ sql: 'DELETE FROM teams WHERE id = ?', args: [id] });
  },
};
