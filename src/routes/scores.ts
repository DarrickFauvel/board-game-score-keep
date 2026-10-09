import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { scoreService } from '../services/scoreService.js';
import { sseRegistry } from '../services/sseRegistry.js';

const router = Router();

router.post('/:sessionId/scores',
  body('participant_id').notEmpty(),
  body('value').isNumeric(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid score data.' });
      }
      const { sessionId } = req.params as { sessionId: string };
      await scoreService.upsertEntry(sessionId, req.body, req.user.sub);
      sseRegistry.broadcastScoresChanged(sessionId);
      if (req.accepts('json')) {
        res.json({ ok: true });
      } else {
        res.redirect('back');
      }
    } catch (err) { next(err); }
  }
);

router.post('/:sessionId/scores/:entryId/delete', async (req, res, next) => {
  try {
    const { sessionId, entryId } = req.params as { sessionId: string; entryId: string };
    await scoreService.removeEntry(entryId);
    sseRegistry.broadcastScoresChanged(sessionId);
    if (req.accepts('json')) {
      res.json({ ok: true });
    } else {
      res.redirect('back');
    }
  } catch (err) { next(err); }
});

export default router;
