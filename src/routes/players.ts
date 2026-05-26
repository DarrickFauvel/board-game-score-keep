import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { playerService } from '../services/playerService.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q as string | undefined) ?? '';
    const players = q
      ? await playerService.search(q)
      : await playerService.listAll();
    if (req.accepts('json')) return res.json(players);
    res.renderEta('players/index', { title: 'Players', players, user: req.user });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const player = await playerService.findById(req.params.id);
    if (!player) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    const stats = await playerService.getStats(req.params.id);
    const history = await playerService.getGameHistory(req.params.id);
    res.renderEta('players/show', { title: player.display_name, player, stats, history, user: req.user });
  } catch (err) { next(err); }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const player = await playerService.findById(req.params.id);
    if (!player) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    if (player.user_id !== req.user.sub) return next(Object.assign(new Error('Forbidden'), { status: 403 }));
    res.renderEta('players/edit', { title: 'Edit Profile', player, user: req.user, error: null });
  } catch (err) { next(err); }
});

router.post('/:id',
  upload.single('avatar'),
  body('display_name').trim().isLength({ min: 1, max: 60 }),
  async (req, res, next) => {
    try {
      const player = await playerService.findById(req.params.id);
      if (!player) return next(Object.assign(new Error('Not Found'), { status: 404 }));
      if (player.user_id !== req.user.sub) return next(Object.assign(new Error('Forbidden'), { status: 403 }));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).renderEta('players/edit', { title: 'Edit Profile', player, user: req.user, error: 'Display name is required.' });
      }
      await playerService.update(req.params.id, req.body as Record<string, unknown>, req.file);
      res.redirect(`/players/${req.params.id}`);
    } catch (err) { next(err); }
  }
);

export default router;
