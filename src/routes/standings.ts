import { Router } from 'express';
import { gameService } from '../services/gameService.js';
import { standingsService } from '../services/standingsService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const games = await gameService.listForGroup(req.group.id);
    const requested = typeof req.query.game === 'string' ? req.query.game : '';
    // Only filter by one of the group's games; anything else falls back to all of them
    const game = games.find((g) => g.id === requested) ?? null;
    const { standings, sessionCount } = await standingsService.forGroup(req.group.id, game ? String(game.id) : undefined);
    res.renderEta('standings/index', {
      title: game ? `${game.name} Standings` : 'Standings',
      user: req.user,
      games,
      selectedGame: game,
      standings,
      sessionCount,
    });
  } catch (err) { next(err); }
});

export default router;
