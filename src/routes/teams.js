import { Router } from 'express';
import { teamService } from '../services/teamService.js';

const router = Router();

router.get('/:gameId', async (req, res, next) => {
  try {
    const teams = await teamService.listByGame(req.params.gameId);
    res.json(teams);
  } catch (err) { next(err); }
});

router.post('/:gameId', async (req, res, next) => {
  try {
    const team = await teamService.create(req.params.gameId, req.body);
    res.status(201).json(team);
  } catch (err) { next(err); }
});

router.post('/:gameId/:id', async (req, res, next) => {
  try {
    await teamService.update(req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:gameId/:id/delete', async (req, res, next) => {
  try {
    await teamService.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
