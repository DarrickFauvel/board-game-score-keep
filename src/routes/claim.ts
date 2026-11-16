import { Router } from 'express';
import { playerService } from '../services/playerService.js';
import { groupRole } from '../services/groupAccess.js';
import { GROUP_COOKIE, groupCookieOptions } from '../middleware/group.js';

/**
 * /claim/:code — a friend opens the link an organizer shared, signs in (or
 * registers; requireAuth brings them back here), and takes a guest's games
 * as their own. The code works once: claiming deletes the guest.
 */
const router = Router();

const gone = () => Object.assign(new Error('Unknown claim link'), {
  status: 404,
  publicMessage: 'This link has already been used or was replaced. Ask the group for a new one.',
});

async function render(req: import('express').Request, res: import('express').Response, code: string, error: string | null = null, status = 200) {
  const guest = await playerService.findByClaimCode(code);
  if (!guest) throw gone();
  const isMember = !!await groupRole(String(guest.group_id), req.user.sub);
  res.status(status).renderEta('players/claim', {
    title: `Claim ${guest.display_name}'s games`, user: req.user, guest, code, isMember, error,
  });
}

router.get('/:code', async (req, res, next) => {
  try { await render(req, res, req.params.code); } catch (err) { next(err); }
});

router.post('/:code', async (req, res, next) => {
  try {
    const result = await playerService.claimGuest(req.params.code, req.user.sub);
    if (!result.ok) {
      if (result.reason === 'gone') return next(gone());
      return await render(req, res, req.params.code, result.reason, 409);
    }
    // Land in the group the games belong to
    res.cookie(GROUP_COOKIE, result.groupId, groupCookieOptions());
    res.redirect(303, `/players/${result.playerId}?claimed=1`);
  } catch (err) { next(err); }
});

export default router;
