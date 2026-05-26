import { Router } from 'express';
import authRouter from './auth.js';
import gamesRouter from './games.js';
import scoresRouter from './scores.js';
import playersRouter from './players.js';
import teamsRouter from './teams.js';
import sseRouter from './sse.js';
import proxyRouter from './proxy.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/sse', sseRouter);
router.use('/proxy/image', proxyRouter);
router.use('/games', requireAuth, gamesRouter);
router.use('/sessions', requireAuth, scoresRouter);
router.use('/players', requireAuth, playersRouter);
router.use('/teams', requireAuth, teamsRouter);

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { gameService } = await import('../services/gameService.js');
    const games = await gameService.listByOwner(req.user.sub);
    res.renderEta('home', { user: req.user, games, title: 'The Keep', keepLayout: true });
  } catch (err) { next(err); }
});

export { router };
