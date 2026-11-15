import { Router, type Request, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import { playerService, AvatarError } from '../services/playerService.js';
import { upload } from '../middleware/upload.js';
import { config } from '../config.js';
import { can } from '../services/groupAccess.js';

const editTitle = (player: Record<string, unknown>) => (player.user_id ? 'Edit Profile' : `Edit ${player.display_name}`);

const router = Router();

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });
const forbidden = () => Object.assign(new Error('Forbidden'), {
  status: 403, publicMessage: "You can edit your own profile, and the group's organizers can edit its guests.",
});

// Only the people the user knows: their group's members and guests, and anyone they've played with
router.get('/', async (req, res, next) => {
  try {
    const players = await playerService.listVisible(req.user.sub, req.group.id, { includeHidden: true });
    const byKind = (k: string) => players.filter((p) => p.kind === k);
    res.renderEta('players/index', {
      title: 'Players', user: req.user,
      members: byKind('member'), guests: byKind('guest'), played: byKind('played'),
      canManageGuests: can(req.group.role, 'manageGuests'),
    });
  } catch (err) { next(err); }
});

// ─── Manage guests (organizers and owners) ─────────────────────────────
// The notice after an action is rebuilt from the group's own guests, so a
// crafted link can't put arbitrary text on the page
const DONE: Record<string, (name: string, n: number) => string> = {
  hidden: (name) => `${name} is hidden from suggestions. Their games still count.`,
  unhidden: (name) => `${name} is back in suggestions.`,
  merged: (name, n) => n
    ? `Merged. ${n} more ${n === 1 ? 'game is' : 'games are'} now on ${name}'s record.`
    : `Merged into ${name}.`,
};

async function renderManage(req: Request, res: Response, error: string | null = null, status = 200) {
  const guests = await playerService.listGuestsForManage(req.group.id);
  const done = typeof req.query.done === 'string' ? DONE[req.query.done] : undefined;
  const guest = guests.find((g) => g.id === req.query.id);
  const n = Math.max(0, Math.trunc(Number(req.query.n) || 0));
  const notice = !error && done && guest ? done(String(guest.display_name), n) : null;
  res.status(status).renderEta('players/manage', { title: 'Manage guests', user: req.user, guests, error, notice });
}

const requireManager: RequestHandler = (req, _res, next) => {
  if (!can(req.group.role, 'manageGuests')) {
    return next(Object.assign(new Error('Forbidden'), { status: 403, publicMessage: "Only the group's organizers and owners can manage guests." }));
  }
  next();
};

router.get('/manage', requireManager, async (req, res, next) => {
  try { await renderManage(req, res); } catch (err) { next(err); }
});

for (const [action, hidden] of [['hide', true], ['unhide', false]] as const) {
  router.post(`/:id/${action}`, requireManager, async (req, res, next) => {
    try {
      const guest = await playerService.findById(req.params.id);
      if (!guest || guest.user_id || guest.group_id !== req.group.id) return next(notFound());
      await playerService.setHidden(req.params.id, req.group.id, hidden);
      const q = new URLSearchParams({ done: hidden ? 'hidden' : 'unhidden', id: String(guest.id) });
      res.redirect(303, `/players/manage?${q}`);
    } catch (err) { next(err); }
  });
}

router.post('/:id/merge', requireManager, body('target_id').trim().notEmpty(), async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) return await renderManage(req, res, 'Pick a guest to merge into.', 400);
    const result = await playerService.mergeGuests(req.params.id, String(req.body.target_id), req.group.id);
    if (!result.ok) return await renderManage(req, res, result.reason, 400);
    const q = new URLSearchParams({ done: 'merged', id: String(req.body.target_id), n: String(result.sessions) });
    res.redirect(303, `/players/manage?${q}`);
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
    if (!player || !await playerService.canView(String(player.id), req.user.sub)) return next(notFound());
    const [stats, history, canEdit] = await Promise.all([
      playerService.getStats(req.params.id),
      playerService.getGameHistory(req.params.id),
      playerService.canEdit(player, req.user.sub),
    ]);
    res.renderEta('players/show', { title: player.display_name, player, stats, history, user: req.user, canEdit });
  } catch (err) { next(err); }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const player = await playerService.findById(req.params.id);
    if (!player || !await playerService.canView(String(player.id), req.user.sub)) return next(notFound());
    if (!await playerService.canEdit(player, req.user.sub)) return next(forbidden());
    res.renderEta('players/edit', { title: editTitle(player), player, user: req.user, error: null });
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
      if (!player || !await playerService.canView(String(player.id), req.user.sub)) return next(notFound());
      if (!await playerService.canEdit(player, req.user.sub)) return next(forbidden());
      const title = editTitle(player);
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).renderEta('players/edit', { title, player, user: req.user, error: 'A name is required.' });
      }
      if (res.locals.avatarError) {
        return res.status(400).renderEta('players/edit', { title, player, user: req.user, error: res.locals.avatarError });
      }
      // A group's guests have distinct names, so "Sam" always means the same Sam
      if (!player.user_id && player.group_id) {
        const clash = await playerService.findGuest(String(player.group_id), String(req.body.display_name));
        if (clash && clash.id !== player.id) {
          return res.status(409).renderEta('players/edit', {
            title, player, user: req.user,
            error: `There's already a guest called ${clash.display_name} in this group. Pick another name, like "${String(req.body.display_name).trim()} B."`,
          });
        }
      }
      try {
        await playerService.update(req.params.id, req.body as Record<string, unknown>, req.file, player.avatar_url as string | null);
      } catch (err) {
        // A bad link or a failed Cloudinary upload: keep them on the form with a reason
        if (config.isDev && !(err instanceof AvatarError)) console.error(err);
        const error = err instanceof AvatarError
          ? err.message
          : "We couldn't use that picture. Try a different image, or a JPEG or PNG under 10 MB.";
        return res.status(400).renderEta('players/edit', { title, player, user: req.user, error });
      }
      res.redirect(303, `/players/${req.params.id}`);
    } catch (err) { next(err); }
  }
);

export default router;
