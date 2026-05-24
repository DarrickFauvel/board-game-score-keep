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
      const entry = await scoreService.upsertEntry(req.params.sessionId, req.body, req.user.sub);
      await sseRegistry.broadcastScoreUpdate(req.params.sessionId, entry);
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
    await scoreService.removeEntry(req.params.entryId);
    await sseRegistry.broadcastFullRefresh(req.params.sessionId);
    if (req.accepts('json')) {
      res.json({ ok: true });
    } else {
      res.redirect('back');
    }
  } catch (err) { next(err); }
});

export default router;
