import { Router } from 'express';
import { gameService } from '../services/gameService.js';
import { standingsService } from '../services/standingsService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const games = await gameService.listByOwner(req.user.sub);
    const requested = typeof req.query.game === 'string' ? req.query.game : '';
    // Only filter by a game the user owns; anything else falls back to all games
    const game = games.find((g) => g.id === requested) ?? null;
    const { standings, sessionCount } = await standingsService.forUser(req.user.sub, game ? String(game.id) : undefined);
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
