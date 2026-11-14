import { db } from '../db/client.js';
import { processUploadedImage } from './imageService.js';
import { parseRoundCount, parseTargetScore } from './rounds.js';
import { isLowestWins } from './winRule.js';

/** Rounds only exist in running-tally scoring, so other modes store none. */
function suggestedRounds(body: Record<string, unknown>) {
  return body.scoring_mode === 'tally' ? parseRoundCount(body.suggested_rounds) : null;
}

/** Likewise a name for them. Already normalized by the route. */
function roundName(body: Record<string, unknown>) {
  return body.scoring_mode === 'tally' ? (body.round_name as string) || null : null;
}

/** 1 when the form picked "Lowest score" under Who wins, else 0. */
function lowestWins(body: Record<string, unknown>) {
  return isLowestWins(body.lowest_wins) ? 1 : 0;
}

export const gameService = {
  /** The group's games, newest first. */
  async listForGroup(groupId: string) {
    const result = await db.execute({
      sql: 'SELECT * FROM games WHERE group_id = ? ORDER BY created_at DESC',
      args: [groupId],
    });
    return result.rows;
  },

  /**
   * The game, if the user is a member of its group, with their role there as
   * `member_role` (see groupAccess: which roles may do what). Null otherwise,
   * which routes answer with a 404.
   */
  async findById(id: string, userId: string) {
    const result = await db.execute({
      sql: `SELECT g.*, gm.role AS member_role
            FROM games g
            JOIN group_members gm ON gm.group_id = g.group_id AND gm.user_id = ?
            WHERE g.id = ?`,
      args: [userId, id],
    });
    return result.rows[0] ?? null;
  },

  async create(userId: string, groupId: string, body: Record<string, unknown>, file?: Express.Multer.File) {
    const imageUrl = await resolveImageUrl(file, body.image_url as string | undefined, 'games');
    const result = await db.execute({
      sql: `INSERT INTO games
              (owner_id, group_id, name, image_url, scoring_mode, teams_mode, color_primary, color_secondary, color_accent, suggested_rounds, target_score, bgg_url, rules_url, rules_video_url, round_name, point_name, lowest_wins)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        userId,
        groupId,
        body.name as string,
        imageUrl ?? null,
        body.scoring_mode as string,
        (body.teams_mode as string) ?? 'none',
        (body.color_primary as string) || null,
        (body.color_secondary as string) || null,
        (body.color_accent as string) || null,
        suggestedRounds(body),
        parseTargetScore(body.target_score),
        (body.bgg_url as string) || null,
        (body.rules_url as string) || null,
        (body.rules_video_url as string) || null,
        roundName(body),
        (body.point_name as string) || null,
        lowestWins(body),
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
              color_primary = ?, color_secondary = ?, color_accent = ?, suggested_rounds = ?, target_score = ?, bgg_url = ?, rules_url = ?, rules_video_url = ?, round_name = ?, point_name = ?, lowest_wins = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
              ${imageUrl !== undefined ? ', image_url = ?' : ''}
            WHERE id = ?`,
      args: imageUrl !== undefined
        ? [body.name as string, body.scoring_mode as string, (body.teams_mode as string) ?? 'none', (body.color_primary as string) || null, (body.color_secondary as string) || null, (body.color_accent as string) || null, suggestedRounds(body), parseTargetScore(body.target_score), (body.bgg_url as string) || null, (body.rules_url as string) || null, (body.rules_video_url as string) || null, roundName(body), (body.point_name as string) || null, lowestWins(body), imageUrl, id]
        : [body.name as string, body.scoring_mode as string, (body.teams_mode as string) ?? 'none', (body.color_primary as string) || null, (body.color_secondary as string) || null, (body.color_accent as string) || null, suggestedRounds(body), parseTargetScore(body.target_score), (body.bgg_url as string) || null, (body.rules_url as string) || null, (body.rules_video_url as string) || null, roundName(body), (body.point_name as string) || null, lowestWins(body), id],
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
  if (file) return processUploadedImage(file.buffer, folder);
  if (urlFromBody?.trim()) return urlFromBody.trim();
  return undefined;
}
