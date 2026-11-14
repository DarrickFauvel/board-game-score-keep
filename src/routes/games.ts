import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { gameService } from '../services/gameService.js';
import { upload } from '../middleware/upload.js';
import { sessionAccess, hostAccess } from '../services/sessionAccess.js';
import { playerService } from '../services/playerService.js';
import { config } from '../config.js';
import { can, type GroupRole } from '../services/groupAccess.js';

/** For members whose role doesn't allow it: they can see the game, so say why. */
const forbidden = (what: string) => Object.assign(new Error('Forbidden'), {
  status: 403,
  publicMessage: `Only the group's organizers and owners can ${what}.`,
});
const roleOf = (game: Record<string, unknown>) => game.member_role as GroupRole;
import { normalizeBggUrl, normalizeRulesUrl, normalizeRulesVideoUrl, BGG_URL_ERROR, RULES_URL_ERROR, RULES_VIDEO_URL_ERROR } from '../services/links.js';
import { normalizeUnitName, UNIT_NAME_ERROR } from '../services/units.js';

/** The game's optional links and unit names, normalized, or the message for the first bad one. */
function parseGameExtras(body: Record<string, unknown>) {
  const bggUrl = normalizeBggUrl(body.bgg_url);
  if (bggUrl === false) return { error: BGG_URL_ERROR } as const;
  const rulesUrl = normalizeRulesUrl(body.rules_url);
  if (rulesUrl === false) return { error: RULES_URL_ERROR } as const;
  const rulesVideoUrl = normalizeRulesVideoUrl(body.rules_video_url);
  if (rulesVideoUrl === false) return { error: RULES_VIDEO_URL_ERROR } as const;
  const roundName = normalizeUnitName(body.round_name);
  const pointName = normalizeUnitName(body.point_name);
  if (roundName === false || pointName === false) return { error: UNIT_NAME_ERROR } as const;
  return {
    fields: { bgg_url: bggUrl, rules_url: rulesUrl, rules_video_url: rulesVideoUrl, round_name: roundName, point_name: pointName },
  } as const;
}

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { sessionService } = await import('../services/sessionService.js');
    const [games, joined] = await Promise.all([
      gameService.listForGroup(req.group.id),
      sessionService.listJoined(req.user.sub),
    ]);
    res.renderEta('games/index', {
      title: 'My Games', games, joined, user: req.user, canManageGames: can(req.group.role, 'manageGames'),
    });
  } catch (err) { next(err); }
});

router.get('/new', (req, res, next) => {
  if (!can(req.group.role, 'manageGames')) return next(forbidden('add games'));
  res.renderEta('games/new', { title: 'Add a Game', user: req.user, error: null });
});

router.post('/',
  upload.single('image'),
  body('name').trim().isLength({ min: 1, max: 120 }),
  body('scoring_mode').isIn(['tally', 'final', 'categories']),
  body('teams_mode').isIn(['none', 'adhoc', 'profiles']),
  async (req, res, next) => {
    try {
      if (!can(req.group.role, 'manageGames')) return next(forbidden('add games'));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).renderEta('games/new', { title: 'Add a Game', user: req.user, error: 'Please fill in all required fields.' });
      }
      const parsed = parseGameExtras(req.body);
      if ('error' in parsed) {
        return res.status(400).renderEta('games/new', { title: 'Add a Game', user: req.user, error: parsed.error });
      }
      const game = await gameService.create(req.user.sub, req.group.id, { ...req.body, ...parsed.fields } as Record<string, unknown>, req.file);
      res.redirect(`/games/${game.id}`);
    } catch (err) { next(err); }
  }
);

router.get('/:id', async (req, res, next) => {
  try {
    const game = await gameService.findById(req.params.id, req.user.sub);
    if (!game) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    const { sessionService } = await import('../services/sessionService.js');
    const sessions = await sessionService.listByGame(req.params.id);
    const { scoreService } = await import('../services/scoreService.js');
    const categories = await scoreService.listCategories(req.params.id);
    res.renderEta('games/show', {
      title: game.name, game, sessions, categories, user: req.user, canManageGames: can(roleOf(game), 'manageGames'),
    });
  } catch (err) { next(err); }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const game = await gameService.findById(req.params.id, req.user.sub);
    if (!game) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    if (!can(roleOf(game), 'manageGames')) return next(forbidden('edit games'));
    const { scoreService } = await import('../services/scoreService.js');
    const categories = await scoreService.listCategories(req.params.id);
    res.renderEta('games/edit', { title: `Edit ${game.name}`, game, categories, user: req.user, error: null });
  } catch (err) { next(err); }
});

router.post('/:id',
  upload.single('image'),
  body('name').trim().isLength({ min: 1, max: 120 }),
  body('scoring_mode').isIn(['tally', 'final', 'categories']),
  body('teams_mode').isIn(['none', 'adhoc', 'profiles']),
  async (req, res, next) => {
    try {
      const game = await gameService.findById(req.params.id, req.user.sub);
      if (!game) return next(Object.assign(new Error('Not Found'), { status: 404 }));
      if (!can(roleOf(game), 'manageGames')) return next(forbidden('edit games'));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const { scoreService } = await import('../services/scoreService.js');
        const categories = await scoreService.listCategories(req.params.id);
        return res.status(400).renderEta('games/edit', { title: `Edit ${game.name}`, game, categories, user: req.user, error: 'Please fill in all required fields.' });
      }
      const parsed = parseGameExtras(req.body);
      if ('error' in parsed) {
        const { scoreService } = await import('../services/scoreService.js');
        const categories = await scoreService.listCategories(req.params.id);
        // Keep what was typed so it can be corrected
        const typed = { ...game, bgg_url: req.body.bgg_url, rules_url: req.body.rules_url, rules_video_url: req.body.rules_video_url,
          round_name: req.body.round_name, point_name: req.body.point_name, lowest_wins: req.body.lowest_wins };
        return res.status(400).renderEta('games/edit', { title: `Edit ${game.name}`, game: typed, categories, user: req.user, error: parsed.error });
      }
      await gameService.update(req.params.id, { ...req.body, ...parsed.fields } as Record<string, unknown>, req.file);
      res.redirect(`/games/${req.params.id}`);
    } catch (err) { next(err); }
  }
);

router.post('/:id/delete', async (req, res, next) => {
  try {
    const game = await gameService.findById(req.params.id, req.user.sub);
    if (!game) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    if (!can(roleOf(game), 'manageGames')) return next(forbidden('delete games'));
    await gameService.remove(req.params.id);
    res.redirect('/games');
  } catch (err) { next(err); }
});

router.get('/:gameId/sessions/new', async (req, res, next) => {
  try {
    // Any member of the game's group can start a session
    const game = await gameService.findById(req.params.gameId, req.user.sub);
    if (!game) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    const { playerService } = await import('../services/playerService.js');
    const players = await playerService.listAll();
    const { teamService } = await import('../services/teamService.js');
    const teams = await teamService.listByGame(req.params.gameId);
    const { scoreService } = await import('../services/scoreService.js');
    const categories = await scoreService.listCategories(req.params.gameId);
    res.renderEta('sessions/new', { title: `New Session – ${game.name}`, game, players, teams, categories, user: req.user });
  } catch (err) { next(err); }
});

router.post('/:gameId/sessions', async (req, res, next) => {
  try {
    const game = await gameService.findById(req.params.gameId, req.user.sub);
    if (!game) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    const { sessionService } = await import('../services/sessionService.js');
    const { parseRoundCount, parseTargetScore } = await import('../services/rounds.js');
    const form = req.body as Record<string, unknown>;
    const plannedRounds = game.scoring_mode === 'tally' ? parseRoundCount(form.planned_rounds) : null;
    const targetScore = parseTargetScore(form.target_score);
    const session = await sessionService.create(req.params.gameId, req.user.sub, form, plannedRounds, targetScore);
    res.redirect(`/games/${req.params.gameId}/sessions/${session.id}`);
  } catch (err) { next(err); }
});

router.get('/:gameId/sessions/:id', async (req, res, next) => {
  try {
    const access = await sessionAccess(req.params.id, req.user.sub, req.params.gameId);
    if (!access) return next(notFound());
    const { game, session, role, canComplete, groupRole } = access;
    const { sessionService } = await import('../services/sessionService.js');
    const { scoreService } = await import('../services/scoreService.js');
    // The host shows an invite while the game is on; created on first need
    const inviteUrl = canComplete && session.status === 'active'
      ? `${config.baseUrl}/join/${await sessionService.ensureInviteCode(session.id as string)}`
      : null;
    // Players see who started the game; the person who started it doesn't need telling
    const hostName = session.created_by !== req.user.sub
      ? (await playerService.findByUserId(session.created_by as string))?.display_name ?? null
      : null;
    const [participants, categories] = await Promise.all([
      sessionService.listParticipants(req.params.id),
      scoreService.listCategories(req.params.gameId),
    ]);
    const [scores, photos] = await Promise.all([
      scoreService.getSessionScores(req.params.id),
      sessionService.listPhotos(req.params.id),
    ]);
    res.renderEta('sessions/show', {
      title: `${game.name} – Session`, game, session, participants, categories, scores, photos, user: req.user,
      role, inviteUrl, hostName, canComplete, groupRole,
    });
  } catch (err) { next(err); }
});

// Just the scoreboard, re-rendered: open session pages fetch it when the
// live stream says scores changed on another device.
router.get('/:gameId/sessions/:id/scoreboard', async (req, res, next) => {
  try {
    const access = await sessionAccess(req.params.id, req.user.sub, req.params.gameId);
    if (!access) return next(notFound());
    const { game, session } = access;
    const { sessionService } = await import('../services/sessionService.js');
    const { scoreService } = await import('../services/scoreService.js');
    const [participants, categories, scores] = await Promise.all([
      sessionService.listParticipants(req.params.id),
      scoreService.listCategories(req.params.gameId),
      scoreService.getSessionScores(req.params.id),
    ]);
    const partial = game.scoring_mode === 'tally' ? 'tally' : game.scoring_mode === 'categories' ? 'categories' : 'final';
    res.set('Cache-Control', 'no-store');
    res.renderEta(`partials/scoreboard-${partial}`, { game, session, participants, categories, scores });
  } catch (err) { next(err); }
});

// fetch() asks for JSON so the page can celebrate in place (keeping the tap's
// permission to play sound); a plain form post still redirects.
router.post('/:gameId/sessions/:id/complete', async (req, res, next) => {
  try {
    const access = await sessionAccess(req.params.id, req.user.sub, req.params.gameId);
    if (!access) return next(notFound());
    if (!access.canComplete) return next(forbidden('complete a game someone else started'));
    const { sessionService } = await import('../services/sessionService.js');
    await sessionService.complete(req.params.id);
    const { sseRegistry } = await import('../services/sseRegistry.js');
    sseRegistry.broadcastSessionComplete(req.params.id);
    if (req.accepts(['html', 'json']) === 'json') {
      return res.json({ celebration: await sessionService.getCelebration(req.params.id) });
    }
    res.redirect(`/games/${req.params.gameId}/sessions/${req.params.id}`);
  } catch (err) { next(err); }
});

router.get('/:gameId/sessions/:id/celebration', async (req, res, next) => {
  try {
    const access = await sessionAccess(req.params.id, req.user.sub, req.params.gameId);
    if (!access) return next(notFound());
    const { sessionService } = await import('../services/sessionService.js');
    res.json({ celebration: await sessionService.getCelebration(req.params.id) });
  } catch (err) { next(err); }
});

router.post('/:gameId/sessions/:id/rounds', async (req, res, next) => {
  try {
    const access = await sessionAccess(req.params.id, req.user.sub, req.params.gameId);
    if (!access) return next(notFound());
    const { session } = access;
    const round = Number(req.body.round);
    if (session.status === 'active' && Number.isInteger(round) && round > 0) {
      const { scoreService } = await import('../services/scoreService.js');
      const { sseRegistry } = await import('../services/sseRegistry.js');
      await scoreService.closeRound(req.params.id, round, req.user.sub);
      sseRegistry.broadcastScoresChanged(req.params.id);
    }
    res.redirect(`/games/${req.params.gameId}/sessions/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/:gameId/sessions/:id/note',
  async (req, res, next) => {
    try {
      if (!await sessionAccess(req.params.id, req.user.sub, req.params.gameId)) return next(notFound());
      const { sessionService } = await import('../services/sessionService.js');
      await sessionService.saveNote(
        req.params.id,
        (req.body as Record<string, unknown>).note as string | undefined,
      );
      res.redirect(`/games/${req.params.gameId}/sessions/${req.params.id}`);
    } catch (err) { next(err); }
  }
);

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });

// Accepts several photos per request (the uploader sends one at a time so each
// shows up as soon as it lands); answers JSON to fetch, redirects a plain form.
router.post('/:gameId/sessions/:id/photos',
  upload.fields([{ name: 'photos', maxCount: 20 }, { name: 'photo', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      if (!await sessionAccess(req.params.id, req.user.sub, req.params.gameId)) return next(notFound());
      const { sessionService } = await import('../services/sessionService.js');
      const { resolveImageUrl } = await import('../services/imageService.js');
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const body = req.body as Record<string, unknown>;
      const added = [];
      for (const file of [...(files?.photos ?? []), ...(files?.photo ?? [])]) {
        const photo = await sessionService.addPhoto(req.params.id, file);
        if (photo) added.push(photo);
      }
      const camera = await sessionService.addPhoto(req.params.id, undefined, body.photo_camera_data as string | undefined);
      if (camera) added.push(camera);

      if (req.accepts(['html', 'json']) === 'json') {
        return res.json({
          photos: added.map((p) => ({ id: p.id, url: resolveImageUrl(p.photo_url as string) })),
        });
      }
      res.redirect(`/games/${req.params.gameId}/sessions/${req.params.id}#photos-heading`);
    } catch (err) { next(err); }
  }
);

router.post('/:gameId/sessions/:id/photos/:photoId',
  body('caption').optional().isString().isLength({ max: 500 }),
  async (req, res, next) => {
    try {
      const { gameId, id, photoId } = req.params as { gameId: string; id: string; photoId: string };
      if (!await sessionAccess(id, req.user.sub, gameId)) return next(notFound());
      if (!validationResult(req).isEmpty()) return next(Object.assign(new Error('Caption is too long.'), { status: 400 }));
      const { sessionService } = await import('../services/sessionService.js');
      const raw = (req.body as Record<string, unknown>).participant_ids;
      const participantIds = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String);
      const updated = await sessionService.updatePhoto(id, photoId, req.body.caption, participantIds);
      if (!updated) return next(notFound());
      res.redirect(`/games/${gameId}/sessions/${id}#photo-${photoId}`);
    } catch (err) { next(err); }
  }
);

router.post('/:gameId/sessions/:id/photos/:photoId/delete', async (req, res, next) => {
  try {
    if (!await hostAccess(req.params.id, req.user.sub, req.params.gameId)) return next(notFound());
    const { sessionService } = await import('../services/sessionService.js');
    await sessionService.removePhoto(req.params.id, req.params.photoId);
    res.redirect(`/games/${req.params.gameId}/sessions/${req.params.id}#photos-heading`);
  } catch (err) { next(err); }
});

router.post('/:gameId/sessions/:id/delete', async (req, res, next) => {
  try {
    if (!await hostAccess(req.params.id, req.user.sub, req.params.gameId)) return next(notFound());
    const { sessionService } = await import('../services/sessionService.js');
    await sessionService.remove(req.params.id);
    res.redirect(`/games/${req.params.gameId}`);
  } catch (err) { next(err); }
});

export default router;
