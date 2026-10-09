import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { gameService } from '../services/gameService.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const games = await gameService.listByOwner(req.user.sub);
    res.renderEta('games/index', { title: 'My Games', games, user: req.user });
  } catch (err) { next(err); }
});

router.get('/new', (req, res) => {
  res.renderEta('games/new', { title: 'Add a Game', user: req.user, error: null });
});

router.post('/',
  upload.single('image'),
  body('name').trim().isLength({ min: 1, max: 120 }),
  body('scoring_mode').isIn(['tally', 'final', 'categories']),
  body('teams_mode').isIn(['none', 'adhoc', 'profiles']),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).renderEta('games/new', { title: 'Add a Game', user: req.user, error: 'Please fill in all required fields.' });
      }
      const game = await gameService.create(req.user.sub, req.body as Record<string, unknown>, req.file);
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
    res.renderEta('games/show', { title: game.name, game, sessions, categories, user: req.user });
  } catch (err) { next(err); }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const game = await gameService.findById(req.params.id, req.user.sub);
    if (!game) return next(Object.assign(new Error('Not Found'), { status: 404 }));
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
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const { scoreService } = await import('../services/scoreService.js');
        const categories = await scoreService.listCategories(req.params.id);
        return res.status(400).renderEta('games/edit', { title: `Edit ${game.name}`, game, categories, user: req.user, error: 'Please fill in all required fields.' });
      }
      await gameService.update(req.params.id, req.body as Record<string, unknown>, req.file);
      res.redirect(`/games/${req.params.id}`);
    } catch (err) { next(err); }
  }
);

router.post('/:id/delete', async (req, res, next) => {
  try {
    const game = await gameService.findById(req.params.id, req.user.sub);
    if (!game) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    await gameService.remove(req.params.id);
    res.redirect('/games');
  } catch (err) { next(err); }
});

router.get('/:gameId/sessions/new', async (req, res, next) => {
  try {
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
    const { parseRoundCount } = await import('../services/rounds.js');
    const form = req.body as Record<string, unknown>;
    const plannedRounds = game.scoring_mode === 'tally' ? parseRoundCount(form.planned_rounds) : null;
    const session = await sessionService.create(req.params.gameId, req.user.sub, form, plannedRounds);
    res.redirect(`/games/${req.params.gameId}/sessions/${session.id}`);
  } catch (err) { next(err); }
});

router.get('/:gameId/sessions/:id', async (req, res, next) => {
  try {
    const game = await gameService.findById(req.params.gameId, req.user.sub);
    if (!game) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    const { sessionService } = await import('../services/sessionService.js');
    const session = await sessionService.findById(req.params.id);
    if (!session) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    const { scoreService } = await import('../services/scoreService.js');
    const [participants, categories] = await Promise.all([
      sessionService.listParticipants(req.params.id),
      scoreService.listCategories(req.params.gameId),
    ]);
    const [scores, photos] = await Promise.all([
      scoreService.getSessionScores(req.params.id),
      sessionService.listPhotos(req.params.id),
    ]);
    res.renderEta('sessions/show', { title: `${game.name} – Session`, game, session, participants, categories, scores, photos, user: req.user });
  } catch (err) { next(err); }
});

router.post('/:gameId/sessions/:id/complete', async (req, res, next) => {
  try {
    const { sessionService } = await import('../services/sessionService.js');
    await sessionService.complete(req.params.id);
    res.redirect(`/games/${req.params.gameId}/sessions/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/:gameId/sessions/:id/rounds', async (req, res, next) => {
  try {
    const game = await gameService.findById(req.params.gameId, req.user.sub);
    if (!game) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    const { sessionService } = await import('../services/sessionService.js');
    const session = await sessionService.findById(req.params.id);
    if (!session) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    const round = Number(req.body.round);
    if (session.status === 'active' && Number.isInteger(round) && round > 0) {
      const { scoreService } = await import('../services/scoreService.js');
      const { sseRegistry } = await import('../services/sseRegistry.js');
      await scoreService.closeRound(req.params.id, round, req.user.sub);
      sseRegistry.broadcastFullRefresh(req.params.id);
    }
    res.redirect(`/games/${req.params.gameId}/sessions/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/:gameId/sessions/:id/note',
  async (req, res, next) => {
    try {
      const { sessionService } = await import('../services/sessionService.js');
      await sessionService.saveNote(
        req.params.id,
        (req.body as Record<string, unknown>).note as string | undefined,
      );
      res.redirect(`/games/${req.params.gameId}/sessions/${req.params.id}`);
    } catch (err) { next(err); }
  }
);

/** The session, if it belongs to this game and the game belongs to the user. */
async function findOwnedSession(gameId: string, sessionId: string, userId: string) {
  const game = await gameService.findById(gameId, userId);
  if (!game) return null;
  const { sessionService } = await import('../services/sessionService.js');
  const session = await sessionService.findById(sessionId);
  return session && session.game_id === gameId ? session : null;
}

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });

// Accepts several photos per request (the uploader sends one at a time so each
// shows up as soon as it lands); answers JSON to fetch, redirects a plain form.
router.post('/:gameId/sessions/:id/photos',
  upload.fields([{ name: 'photos', maxCount: 20 }, { name: 'photo', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      if (!await findOwnedSession(req.params.gameId, req.params.id, req.user.sub)) return next(notFound());
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
      if (!await findOwnedSession(gameId, id, req.user.sub)) return next(notFound());
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
    if (!await findOwnedSession(req.params.gameId, req.params.id, req.user.sub)) return next(notFound());
    const { sessionService } = await import('../services/sessionService.js');
    await sessionService.removePhoto(req.params.id, req.params.photoId);
    res.redirect(`/games/${req.params.gameId}/sessions/${req.params.id}#photos-heading`);
  } catch (err) { next(err); }
});

router.post('/:gameId/sessions/:id/delete', async (req, res, next) => {
  try {
    const { sessionService } = await import('../services/sessionService.js');
    await sessionService.remove(req.params.id);
    res.redirect(`/games/${req.params.gameId}`);
  } catch (err) { next(err); }
});

export default router;
