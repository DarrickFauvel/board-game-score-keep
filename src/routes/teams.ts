import { Router, type Request } from 'express';
import { teamService } from '../services/teamService.js';
import { gameService } from '../services/gameService.js';
import { playerService } from '../services/playerService.js';
import { can, type GroupRole } from '../services/groupAccess.js';
import { db } from '../db/client.js';

/**
 * A game's saved teams. Anyone in the game's group can see them; organizers
 * and owners change them, and only with players they can see.
 */
const router = Router();

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });
const forbidden = () => Object.assign(new Error('Forbidden'), {
  status: 403, publicMessage: "Only the group's organizers and owners can change teams.",
});

/** The game if the user may manage its teams; throws 404/403 otherwise. */
async function manageableGame(req: Request) {
  const game = await gameService.findById(req.params.gameId, req.user.sub);
  if (!game) throw notFound();
  if (!can(game.member_role as GroupRole, 'manageGames')) throw forbidden();
  return game;
}

/** Keep only player ids the user can see in the game's group. */
async function visibleIds(req: Request, groupId: string, raw: unknown) {
  if (raw === undefined) return undefined;
  const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String);
  const visible = new Set((await playerService.listVisible(req.user.sub, groupId, { includeHidden: true })).map((p) => String(p.id)));
  return ids.filter((id) => visible.has(id));
}

async function teamInGame(teamId: string, gameId: string) {
  const r = await db.execute({ sql: 'SELECT 1 FROM teams WHERE id = ? AND game_id = ?', args: [teamId, gameId] });
  return r.rows.length > 0;
}

router.get('/:gameId', async (req, res, next) => {
  try {
    if (!await gameService.findById(req.params.gameId, req.user.sub)) return next(notFound());
    res.json(await teamService.listByGame(req.params.gameId));
  } catch (err) { next(err); }
});

router.post('/:gameId', async (req, res, next) => {
  try {
    const game = await manageableGame(req);
    const body = { ...req.body, player_ids: await visibleIds(req, String(game.group_id), req.body.player_ids) };
    res.status(201).json(await teamService.create(req.params.gameId, body));
  } catch (err) { next(err); }
});

router.post('/:gameId/:id', async (req, res, next) => {
  try {
    const game = await manageableGame(req);
    if (!await teamInGame(req.params.id, req.params.gameId)) return next(notFound());
    const body = { ...req.body, player_ids: await visibleIds(req, String(game.group_id), req.body.player_ids) };
    await teamService.update(req.params.id, body);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:gameId/:id/delete', async (req, res, next) => {
  try {
    await manageableGame(req);
    if (!await teamInGame(req.params.id, req.params.gameId)) return next(notFound());
    await teamService.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
