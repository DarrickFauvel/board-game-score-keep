import { Router } from 'express';
import { sessionService } from '../services/sessionService.js';
import { playerService } from '../services/playerService.js';
import { sseRegistry } from '../services/sseRegistry.js';
import { sessionAccess } from '../services/sessionAccess.js';

/**
 * /join/:code — the link (or QR code) a host shares to bring people into a
 * session. Signed-in visitors confirm, then play as a linked player: their
 * picture and record follow them, and they can enter scores from their phone.
 */
const router = Router();

const badLink = () => Object.assign(new Error('Unknown invite code'), {
  status: 404,
  publicMessage: "This invite link doesn't work. Ask the host to show the code again.",
});
const sessionPath = (s: Record<string, unknown>) => `/games/${s.game_id}/sessions/${s.id}`;

router.get('/:code', async (req, res, next) => {
  try {
    const session = await sessionService.findByInviteCode(req.params.code);
    if (!session) return next(badLink());
    if (await sessionAccess(session.id as string, req.user.sub)) return res.redirect(sessionPath(session));

    const me = await playerService.findByUserId(req.user.sub);
    if (!me) return next(badLink());
    const [participants, guestMatches] = await Promise.all([
      sessionService.listParticipants(session.id as string),
      sessionService.guestsNamed(session.id as string, me.display_name as string),
    ]);
    res.renderEta('sessions/join', {
      title: `Join ${session.game_name}`, user: req.user, session, participants, me, guestMatches,
      code: req.params.code, error: null,
    });
  } catch (err) { next(err); }
});

router.post('/:code', async (req, res, next) => {
  try {
    const session = await sessionService.findByInviteCode(req.params.code);
    if (!session) return next(badLink());
    const sessionId = session.id as string;
    // Already in (joined from another tab, or the host): just go to the game
    if (await sessionAccess(sessionId, req.user.sub)) return res.redirect(303, sessionPath(session));
    if (session.status !== 'active') return res.redirect(303, `/join/${req.params.code}`);

    const me = await playerService.findByUserId(req.user.sub);
    if (!me) return next(badLink());

    const claim = String((req.body as Record<string, unknown>).claim ?? 'new');
    if (claim === 'new') {
      await sessionService.addPlayer(sessionId, {
        id: me.id as string, display_name: me.display_name as string, preferred_color: (me.preferred_color as string) ?? null,
      });
    } else {
      // Only a guest with their name can be claimed, so nobody takes over someone else's spot
      const allowed = (await sessionService.guestsNamed(sessionId, me.display_name as string)).some((g) => g.id === claim);
      if (!allowed || !await sessionService.claimGuest(sessionId, claim, me.id as string)) {
        const [participants, guestMatches] = await Promise.all([
          sessionService.listParticipants(sessionId),
          sessionService.guestsNamed(sessionId, me.display_name as string),
        ]);
        return res.status(409).renderEta('sessions/join', {
          title: `Join ${session.game_name}`, user: req.user, session, participants, me, guestMatches,
          code: req.params.code, error: 'That spot was just taken. Join as a new player, or ask the host to check the player list.',
        });
      }
    }
    // Open scoreboards pick up the new name right away
    sseRegistry.broadcastScoresChanged(sessionId);
    res.redirect(303, sessionPath(session));
  } catch (err) { next(err); }
});

export default router;
