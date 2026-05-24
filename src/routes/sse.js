import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sseRegistry } from '../services/sseRegistry.js';

const router = Router();

router.get('/sessions/:sessionId/scores', requireAuth, (req, res) => {
  sseRegistry.connect(req.params.sessionId, req.user.sub, req, res);
});

export default router;
