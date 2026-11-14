import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import { playerService, AvatarError } from '../services/playerService.js';
import { upload } from '../middleware/upload.js';
import { config } from '../config.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q as string | undefined) ?? '';
    const players = q
      ? await playerService.search(q)
      : await playerService.listAll();
    if (req.accepts(['html', 'json']) === 'json') return res.json(players);
    res.renderEta('players/index', { title: 'Players', players, user: req.user });
  } catch (err) { next(err); }
});

// The signed-in person's own profile, for the nav link
router.get('/me', async (req, res, next) => {
  try {
    const player = await playerService.findByUserId(req.user.sub);
    if (!player) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    res.redirect(`/players/${player.id}`);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const player = await playerService.findById(req.params.id);
    if (!player) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    const stats = await playerService.getStats(req.params.id);
    const history = await playerService.getGameHistory(req.params.id);
    res.renderEta('players/show', { title: player.display_name, player, stats, history, user: req.user });
  } catch (err) { next(err); }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const player = await playerService.findById(req.params.id);
    if (!player) return next(Object.assign(new Error('Not Found'), { status: 404 }));
    if (player.user_id !== req.user.sub) return next(Object.assign(new Error('Forbidden'), { status: 403 }));
    res.renderEta('players/edit', { title: 'Edit Profile', player, user: req.user, error: null });
  } catch (err) { next(err); }
});

// Like upload.single('avatar'), but a too-large file becomes a form error instead of a 500
const avatarUpload: RequestHandler = (req, res, next) => {
  upload.single('avatar')(req, res, (err?: unknown) => {
    if (err instanceof multer.MulterError) {
      res.locals.avatarError = err.code === 'LIMIT_FILE_SIZE'
        ? 'That picture is over 10 MB. Choose a smaller one.'
        : "We couldn't read that picture. Try a different file.";
      return next();
    }
    next(err);
  });
};

router.post('/:id',
  avatarUpload,
  body('display_name').trim().isLength({ min: 1, max: 60 }),
  async (req, res, next) => {
    try {
      const player = await playerService.findById(req.params.id);
      if (!player) return next(Object.assign(new Error('Not Found'), { status: 404 }));
      if (player.user_id !== req.user.sub) return next(Object.assign(new Error('Forbidden'), { status: 403 }));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).renderEta('players/edit', { title: 'Edit Profile', player, user: req.user, error: 'Display name is required.' });
      }
      if (res.locals.avatarError) {
        return res.status(400).renderEta('players/edit', { title: 'Edit Profile', player, user: req.user, error: res.locals.avatarError });
      }
      try {
        await playerService.update(req.params.id, req.body as Record<string, unknown>, req.file, player.avatar_url as string | null);
      } catch (err) {
        // A bad link or a failed Cloudinary upload: keep them on the form with a reason
        if (config.isDev && !(err instanceof AvatarError)) console.error(err);
        const error = err instanceof AvatarError
          ? err.message
          : "We couldn't use that picture. Try a different image, or a JPEG or PNG under 10 MB.";
        return res.status(400).renderEta('players/edit', { title: 'Edit Profile', player, user: req.user, error });
      }
      res.redirect(303, `/players/${req.params.id}`);
    } catch (err) { next(err); }
  }
);

export default router;
