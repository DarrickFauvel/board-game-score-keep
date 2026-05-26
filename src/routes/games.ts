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
    const session = await sessionService.create(req.params.gameId, req.user.sub, req.body as Record<string, unknown>);
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

router.post('/:gameId/sessions/:id/photos',
  upload.single('photo'),
  async (req, res, next) => {
    try {
      const { sessionService } = await import('../services/sessionService.js');
      const body = req.body as Record<string, unknown>;
      await sessionService.addPhoto(
        req.params.id,
        req.file,
        body.photo_camera_data as string | undefined,
      );
      res.redirect(`/games/${req.params.gameId}/sessions/${req.params.id}`);
    } catch (err) { next(err); }
  }
);

router.post('/:gameId/sessions/:id/photos/:photoId/delete', async (req, res, next) => {
  try {
    const { sessionService } = await import('../services/sessionService.js');
    await sessionService.removePhoto(req.params.photoId);
    res.redirect(`/games/${req.params.gameId}/sessions/${req.params.id}`);
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
