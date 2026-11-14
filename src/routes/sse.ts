import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sseRegistry } from '../services/sseRegistry.js';
import { sessionAccess } from '../services/sessionAccess.js';

const router = Router();

// Only the host and joined players can listen to a session's live scores
router.get('/sessions/:sessionId/scores', requireAuth, async (req, res, next) => {
  try {
    if (!await sessionAccess(req.params.sessionId, req.user.sub)) {
      return next(Object.assign(new Error('Not Found'), { status: 404 }));
    }
    sseRegistry.connect(req.params.sessionId, req.user.sub, req, res);
  } catch (err) { next(err); }
});

export default router;
