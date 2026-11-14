import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { scoreService } from '../services/scoreService.js';
import { sseRegistry } from '../services/sseRegistry.js';
import { sessionAccess } from '../services/sessionAccess.js';
import { db } from '../db/client.js';

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });

/** True when the row with this id belongs to the session (a participant or a score entry). */
async function belongsToSession(table: 'session_participants' | 'score_entries', id: unknown, sessionId: string) {
  if (typeof id !== 'string' || !id) return false;
  const r = await db.execute({ sql: `SELECT 1 FROM ${table} WHERE id = ? AND session_id = ?`, args: [id, sessionId] });
  return r.rows.length > 0;
}

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
      // The host and joined players may enter anyone's score, while the session is open
      const access = await sessionAccess(sessionId, req.user.sub);
      if (!access) return next(notFound());
      if (access.session.status !== 'active') {
        return res.status(409).json({ error: 'This session is complete, so its scores are locked.' });
      }
      if (!await belongsToSession('session_participants', req.body.participant_id, sessionId)) {
        return res.status(400).json({ error: 'That player is not in this session.' });
      }
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
    const access = await sessionAccess(sessionId, req.user.sub);
    if (!access || !await belongsToSession('score_entries', entryId, sessionId)) return next(notFound());
    if (access.session.status !== 'active') {
      return res.status(409).json({ error: 'This session is complete, so its scores are locked.' });
    }
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
