import { Router, type Request, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import { playerService, AvatarError } from '../services/playerService.js';
import { upload } from '../middleware/upload.js';
import { config } from '../config.js';
import { can } from '../services/groupAccess.js';
import { isDatastar, reply, saved, invalid, clearError, toast, flash, escapeText } from '../datastar.js';

const editTitle = (player: Record<string, unknown>) => (player.user_id ? 'Edit profile' : `Edit ${player.display_name}`);

const router = Router();

const notFound = () => Object.assign(new Error('Not found'), { status: 404 });
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
// What each action says afterwards, as a toast on the page it returns to
const DONE: Record<string, (name: string, n: number) => string> = {
  hidden: (name) => `${name} is hidden from suggestions. Their games still count.`,
  unhidden: (name) => `${name} is back in suggestions.`,
  merged: (name, n) => n
    ? `Merged. ${n} more ${n === 1 ? 'game is' : 'games are'} now on ${name}'s record.`
    : `Merged into ${name}.`,
};

async function renderManage(req: Request, res: Response, error: string | null = null, status = 200) {
  const guests = await playerService.listGuestsForManage(req.group.id);
  res.status(status).renderEta('players/manage', { title: 'Manage guests', user: req.user, guests, error });
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
      flash(res, DONE[hidden ? 'hidden' : 'unhidden'](String(guest.display_name), 0));
      res.redirect(303, '/players/manage');
    } catch (err) { next(err); }
  });
}

router.post('/:id/merge', requireManager, body('target_id').trim().notEmpty(), async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) return await renderManage(req, res, 'Pick a guest to merge into.', 400);
    const result = await playerService.mergeGuests(req.params.id, String(req.body.target_id), req.group.id);
    if (!result.ok) return await renderManage(req, res, result.reason, 400);
    const target = await playerService.findById(String(req.body.target_id));
    flash(res, DONE.merged(String(target?.display_name ?? 'the other guest'), result.sessions));
    res.redirect(303, '/players/manage');
  } catch (err) { next(err); }
});

// The signed-in person's own profile, for the nav link
router.get('/me', async (req, res, next) => {
  try {
    const player = await playerService.findByUserId(req.user.sub);
    if (!player) return next(Object.assign(new Error('Not found'), { status: 404 }));
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
    // Organizers see the guest's claim link once they've made one
    const claimUrl = canEdit && !player.user_id && player.claim_code ? `${config.baseUrl}/claim/${player.claim_code}` : null;
    // Shown once after claiming someone's games (fixed text, so a crafted link adds nothing)
    const claimed = req.query.claimed === '1' && player.user_id === req.user.sub;
    res.renderEta('players/show', { title: player.display_name, player, stats, history, user: req.user, canEdit, claimUrl, claimed });
  } catch (err) { next(err); }
});

// Make (or replace) the link a friend opens to claim this guest's games
for (const [path, reset] of [['/:id/claim-link', false], ['/:id/claim-link/reset', true]] as const) {
  router.post(path, async (req, res, next) => {
    try {
      const player = await playerService.findById(req.params.id);
      if (!player || player.user_id || !await playerService.canView(String(player.id), req.user.sub)) return next(notFound());
      if (!await playerService.canEdit(player, req.user.sub)) return next(forbidden());
      if (reset) await playerService.resetClaimCode(req.params.id);
      else await playerService.ensureClaimCode(req.params.id);
      if (reset) flash(res, 'New claim link made. The old one no longer works.');
      res.redirect(303, `/players/${req.params.id}#claim`);
    } catch (err) { next(err); }
  });
}

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

/** The player, if you may edit them; otherwise the error to pass on. */
async function editable(req: Request) {
  const player = await playerService.findById(req.params.id);
  if (!player || !await playerService.canView(String(player.id), req.user.sub)) return { error: notFound() } as const;
  if (!await playerService.canEdit(player, req.user.sub)) return { error: forbidden() } as const;
  return { player } as const;
}

const COLOR = /^#[0-9a-f]{6}$/i;

// Name and color: save as they change (Datastar), or with the no-JavaScript button
router.post('/:id/details', async (req, res, next) => {
  try {
    const found = await editable(req);
    if ('error' in found) return next(found.error);
    const { player } = found;
    const name = String(req.body.display_name ?? '').trim();
    const color = COLOR.test(String(req.body.preferred_color ?? '')) ? String(req.body.preferred_color) : null;

    let error: string | null = null;
    if (!name || name.length > 60) error = 'A name is required, up to 60 characters.';
    // A group's guests have distinct names, so "Sam" always means the same Sam
    else if (!player.user_id && player.group_id) {
      const clash = await playerService.findGuest(String(player.group_id), name);
      if (clash && clash.id !== player.id) {
        error = `There's already a guest called ${clash.display_name} in this group. Pick another name, like "${name} B."`;
      }
    }

    if (isDatastar(req)) {
      return reply(req, res, async (sse) => {
        // Which field changed, so only that one flashes
        const field = req.query.field === 'color' ? 'color' : 'name';
        if (error) return invalid(sse, 'save-name', error);
        await playerService.updateDetails(String(player.id), name, color);
        clearError(sse, 'save-name');
        saved(sse, `save-${field}`, field === 'color' ? 'Color saved' : 'Name saved');
        // Your own name also shows in the bar under the header
        if (field === 'name' && player.user_id === req.user.sub) {
          sse.patchElements(escapeText(name), { selector: '#context-me-name', mode: 'inner' });
        }
      });
    }
    if (error) {
      return res.status(400).renderEta('players/edit', { title: editTitle(player), player, user: req.user, error });
    }
    await playerService.updateDetails(String(player.id), name, color);
    flash(res, 'Profile saved');
    res.redirect(303, `/players/${req.params.id}/edit`);
  } catch (err) { next(err); }
});

// A new picture, a new framing, or removing it. An explicit save: you frame
// a picture before it's stored, so it can't save the moment you pick one.
router.post('/:id/picture', avatarUpload, async (req, res, next) => {
  try {
    const found = await editable(req);
    if ('error' in found) return next(found.error);
    const { player } = found;
    const title = editTitle(player);
    if (res.locals.avatarError) {
      return res.status(400).renderEta('players/edit', { title, player, user: req.user, error: res.locals.avatarError });
    }
    let changed: boolean;
    try {
      changed = await playerService.updatePicture(String(player.id), req.body as Record<string, unknown>, req.file, player.avatar_url as string | null);
    } catch (err) {
      // A bad link or a failed Cloudinary upload: keep them on the form with a reason
      if (config.isDev && !(err instanceof AvatarError)) console.error(err);
      const error = err instanceof AvatarError
        ? err.message
        : "We couldn't use that picture. Try a different image, or a JPEG or PNG under 10 MB.";
      return res.status(400).renderEta('players/edit', { title, player, user: req.user, error });
    }
    if (changed) flash(res, req.body.remove_avatar === '1' ? 'Picture removed' : 'Picture saved');
    res.redirect(303, `/players/${req.params.id}/edit`);
  } catch (err) { next(err); }
});

export default router;
