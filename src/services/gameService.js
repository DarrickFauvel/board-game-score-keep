import { db } from '../db/client.js';
import { processUploadedImage } from './imageService.js';

export const gameService = {
  async listByOwner(userId) {
    const result = await db.execute({
      sql: 'SELECT * FROM games WHERE owner_id = ? ORDER BY created_at DESC',
      args: [userId],
    });
    return result.rows;
  },

  async findById(id, userId) {
    const result = await db.execute({
      sql: 'SELECT * FROM games WHERE id = ? AND owner_id = ?',
      args: [id, userId],
    });
    return result.rows[0] ?? null;
  },

  async create(userId, body, file) {
    const imageUrl = await resolveImageUrl(file, body.image_url, 'games');
    const result = await db.execute({
      sql: `INSERT INTO games
              (owner_id, name, image_url, scoring_mode, teams_mode, color_primary, color_secondary, color_accent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        userId,
        body.name,
        imageUrl,
        body.scoring_mode,
        body.teams_mode ?? 'none',
        body.color_primary || null,
        body.color_secondary || null,
        body.color_accent || null,
      ],
    });
    const game = result.rows[0];

    if (body.scoring_mode === 'categories' && body.categories) {
      const cats = Array.isArray(body.categories) ? body.categories : [body.categories];
      for (let i = 0; i < cats.length; i++) {
        if (cats[i].trim()) {
          await db.execute({
            sql: 'INSERT INTO score_categories (game_id, name, sort_order) VALUES (?, ?, ?)',
            args: [game.id, cats[i].trim(), i],
          });
        }
      }
    }

    return game;
  },

  async update(id, body, file) {
    const imageUrl = await resolveImageUrl(file, body.image_url, 'games');
    await db.execute({
      sql: `UPDATE games SET
              name = ?, scoring_mode = ?, teams_mode = ?,
              color_primary = ?, color_secondary = ?, color_accent = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
              ${imageUrl !== undefined ? ', image_url = ?' : ''}
            WHERE id = ?`,
      args: imageUrl !== undefined
        ? [body.name, body.scoring_mode, body.teams_mode ?? 'none', body.color_primary || null, body.color_secondary || null, body.color_accent || null, imageUrl, id]
        : [body.name, body.scoring_mode, body.teams_mode ?? 'none', body.color_primary || null, body.color_secondary || null, body.color_accent || null, id],
    });

    if (body.scoring_mode === 'categories') {
      await db.execute({ sql: 'DELETE FROM score_categories WHERE game_id = ?', args: [id] });
      const cats = Array.isArray(body.categories) ? body.categories : (body.categories ? [body.categories] : []);
      for (let i = 0; i < cats.length; i++) {
        if (cats[i].trim()) {
          await db.execute({
            sql: 'INSERT INTO score_categories (game_id, name, sort_order) VALUES (?, ?, ?)',
            args: [id, cats[i].trim(), i],
          });
        }
      }
    }
  },

  async remove(id) {
    await db.execute({ sql: 'DELETE FROM games WHERE id = ?', args: [id] });
  },
};

async function resolveImageUrl(file, urlFromBody, folder) {
  if (file) {
    return await processUploadedImage(file.path, folder);
  }
  if (urlFromBody?.trim()) return urlFromBody.trim();
  return undefined;
}
