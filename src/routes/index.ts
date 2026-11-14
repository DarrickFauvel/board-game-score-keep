import { Router } from 'express';
import authRouter from './auth.js';
import gamesRouter from './games.js';
import scoresRouter from './scores.js';
import playersRouter from './players.js';
import teamsRouter from './teams.js';
import standingsRouter from './standings.js';
import sseRouter from './sse.js';
import proxyRouter from './proxy.js';
import joinRouter from './join.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { currentGroup } from '../middleware/group.js';
import groupsRouter from './groups.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/sse', sseRouter);
router.use('/proxy/image', proxyRouter);
// Signed-in pages know which group is being viewed (req.group)
router.use('/games', requireAuth, currentGroup, gamesRouter);
router.use('/sessions', requireAuth, currentGroup, scoresRouter);
router.use('/players', requireAuth, currentGroup, playersRouter);
router.use('/teams', requireAuth, currentGroup, teamsRouter);
router.use('/standings', requireAuth, currentGroup, standingsRouter);
router.use('/join', requireAuth, currentGroup, joinRouter);
router.use('/groups', requireAuth, currentGroup, groupsRouter);

// Signed-out visitors get the public landing page; signed-in users get The Keep.
router.get('/', optionalAuth, (req, res, next) => (req.user ? currentGroup(req, res, next) : next()), async (req, res, next) => {
  if (!req.user) return res.renderEta('landing');
  try {
    const { gameService } = await import('../services/gameService.js');
    const { standingsService } = await import('../services/standingsService.js');
    const [games, hall] = await Promise.all([
      gameService.listForGroup(req.group.id),
      standingsService.hallOfFame(req.group.id),
    ]);
    res.renderEta('home', { user: req.user, games, hall, keepLayout: true });
  } catch (err) { next(err); }
});

export { router };
