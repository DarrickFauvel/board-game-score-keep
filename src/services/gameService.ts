import { db } from '../db/client.js';
import { processUploadedImage } from './imageService.js';

export const gameService = {
  async listByOwner(userId: string) {
    const result = await db.execute({
      sql: 'SELECT * FROM games WHERE owner_id = ? ORDER BY created_at DESC',
      args: [userId],
    });
    return result.rows;
  },

  async findById(id: string, userId: string) {
    const result = await db.execute({
      sql: 'SELECT * FROM games WHERE id = ? AND owner_id = ?',
      args: [id, userId],
    });
    return result.rows[0] ?? null;
  },

  async create(userId: string, body: Record<string, unknown>, file?: Express.Multer.File) {
    const imageUrl = await resolveImageUrl(file, body.image_url as string | undefined, 'games');
    const result = await db.execute({
      sql: `INSERT INTO games
              (owner_id, name, image_url, scoring_mode, teams_mode, color_primary, color_secondary, color_accent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        userId,
        body.name as string,
        imageUrl ?? null,
        body.scoring_mode as string,
        (body.teams_mode as string) ?? 'none',
        (body.color_primary as string) || null,
        (body.color_secondary as string) || null,
        (body.color_accent as string) || null,
      ],
    });
    const game = result.rows[0];

    if (body.scoring_mode === 'categories' && body.categories) {
      const cats = Array.isArray(body.categories) ? body.categories : [body.categories];
      for (let i = 0; i < cats.length; i++) {
        const cat = cats[i] as string;
        if (cat.trim()) {
          await db.execute({
            sql: 'INSERT INTO score_categories (game_id, name, sort_order) VALUES (?, ?, ?)',
            args: [game.id, cat.trim(), i],
          });
        }
      }
    }

    return game;
  },

  async update(id: string, body: Record<string, unknown>, file?: Express.Multer.File) {
    const imageUrl = await resolveImageUrl(file, body.image_url as string | undefined, 'games');
    await db.execute({
      sql: `UPDATE games SET
              name = ?, scoring_mode = ?, teams_mode = ?,
              color_primary = ?, color_secondary = ?, color_accent = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
              ${imageUrl !== undefined ? ', image_url = ?' : ''}
            WHERE id = ?`,
      args: imageUrl !== undefined
        ? [body.name as string, body.scoring_mode as string, (body.teams_mode as string) ?? 'none', (body.color_primary as string) || null, (body.color_secondary as string) || null, (body.color_accent as string) || null, imageUrl, id]
        : [body.name as string, body.scoring_mode as string, (body.teams_mode as string) ?? 'none', (body.color_primary as string) || null, (body.color_secondary as string) || null, (body.color_accent as string) || null, id],
    });

    if (body.scoring_mode === 'categories') {
      await db.execute({ sql: 'DELETE FROM score_categories WHERE game_id = ?', args: [id] });
      const cats = Array.isArray(body.categories) ? body.categories : (body.categories ? [body.categories] : []);
      for (let i = 0; i < cats.length; i++) {
        const cat = cats[i] as string;
        if (cat.trim()) {
          await db.execute({
            sql: 'INSERT INTO score_categories (game_id, name, sort_order) VALUES (?, ?, ?)',
            args: [id, cat.trim(), i],
          });
        }
      }
    }
  },

  async remove(id: string) {
    await db.execute({ sql: 'DELETE FROM games WHERE id = ?', args: [id] });
  },
};

async function resolveImageUrl(
  file: Express.Multer.File | undefined,
  urlFromBody: string | undefined,
  folder: string,
): Promise<string | undefined> {
  if (file) return processUploadedImage(file.path, folder);
  if (urlFromBody?.trim()) return urlFromBody.trim();
  return undefined;
}
