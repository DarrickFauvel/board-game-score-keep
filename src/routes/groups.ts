import { Router, type Request, type Response } from 'express';
import { groupService, GroupError } from '../services/groupService.js';
import { can, groupRole, ROLE_LABEL } from '../services/groupAccess.js';
import { GROUP_COOKIE, groupCookieOptions } from '../middleware/group.js';
import { safeNext } from '../middleware/auth.js';
import { config } from '../config.js';

/**
 * Groups: a family or game night crew sharing games, guests and history.
 * Owners manage members and roles; organizers manage games and invite;
 * players play (see services/groupAccess.ts).
 */
const router = Router();

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });
const forbidden = (msg: string) => Object.assign(new Error('Forbidden'), { status: 403, publicMessage: msg });
const badInvite = () => Object.assign(new Error('Unknown group invite'), {
  status: 404,
  publicMessage: "This group invite doesn't work. Ask the group for a new link.",
});
const cleanName = (raw: unknown) => (typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '');

function switchTo(res: Response, groupId: string) {
  res.cookie(GROUP_COOKIE, groupId, groupCookieOptions());
}

/** The group page, optionally with a message about what just failed. */
async function renderGroup(req: Request, res: Response, groupId: string, error: string | null = null, status = 200) {
  const role = await groupRole(groupId, req.user.sub);
  const group = await groupService.findById(groupId);
  if (!role || !group) throw notFound();
  const members = await groupService.members(groupId);
  const inviteUrl = can(role, 'invite') ? `${config.baseUrl}/groups/join/${await groupService.ensureInviteCode(groupId)}` : null;
  res.status(status).renderEta('groups/show', {
    title: String(group.name), user: req.user, group, role, members, inviteUrl, error,
    roleLabel: ROLE_LABEL, canManageMembers: can(role, 'manageMembers'), canManageGroup: can(role, 'manageGroup'),
    isCurrent: req.group.id === groupId,
  });
}

router.get('/', (req, res) => {
  res.renderEta('groups/index', { title: 'Your groups', user: req.user, roleLabel: ROLE_LABEL, error: null });
});

router.post('/', async (req, res, next) => {
  try {
    const name = cleanName(req.body.name);
    if (!name || name.length > 60) {
      return res.status(400).renderEta('groups/index', {
        title: 'Your groups', user: req.user, roleLabel: ROLE_LABEL, error: 'Give the group a name, up to 60 characters.',
      });
    }
    const group = await groupService.create(req.user.sub, name);
    switchTo(res, String(group.id));
    res.redirect(303, `/groups/${group.id}`);
  } catch (err) { next(err); }
});

// Header switcher: look at another of your groups
router.post('/switch', (req, res, next) => {
  const id = String(req.body.group_id ?? '');
  if (!req.groups.some((g) => g.id === id)) return next(notFound());
  switchTo(res, id);
  res.redirect(303, safeNext(req.body.next));
});

/* ─── Joining by invite ─────────────────────────────── */

router.get('/join/:code', async (req, res, next) => {
  try {
    const group = await groupService.findByInviteCode(req.params.code);
    if (!group) return next(badInvite());
    if (await groupRole(String(group.id), req.user.sub)) {
      switchTo(res, String(group.id));
      return res.redirect(303, '/games');
    }
    const members = await groupService.members(String(group.id));
    res.renderEta('groups/join', { title: `Join ${group.name}`, user: req.user, group, members, code: req.params.code });
  } catch (err) { next(err); }
});

router.post('/join/:code', async (req, res, next) => {
  try {
    const group = await groupService.findByInviteCode(req.params.code);
    if (!group) return next(badInvite());
    await groupService.addMember(String(group.id), req.user.sub);
    switchTo(res, String(group.id));
    res.redirect(303, '/games');
  } catch (err) { next(err); }
});

/* ─── One group ─────────────────────────────────────── */

router.get('/:id', async (req, res, next) => {
  try { await renderGroup(req, res, req.params.id); } catch (err) { next(err); }
});

router.post('/:id/rename', async (req, res, next) => {
  try {
    const role = await groupRole(req.params.id, req.user.sub);
    if (!role) return next(notFound());
    if (!can(role, 'manageGroup')) return next(forbidden("Only the group's owners can rename it."));
    const name = cleanName(req.body.name);
    if (!name || name.length > 60) return renderGroup(req, res, req.params.id, 'Give the group a name, up to 60 characters.', 400);
    await groupService.rename(req.params.id, name);
    res.redirect(303, `/groups/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/:id/members/:userId/role', async (req, res, next) => {
  try {
    const role = await groupRole(req.params.id, req.user.sub);
    if (!role) return next(notFound());
    if (!can(role, 'manageMembers')) return next(forbidden("Only the group's owners can change roles."));
    try {
      await groupService.setRole(req.params.id, req.params.userId, req.body.role);
    } catch (err) {
      if (err instanceof GroupError) return renderGroup(req, res, req.params.id, err.message, 409);
      throw err;
    }
    res.redirect(303, `/groups/${req.params.id}`);
  } catch (err) { next(err); }
});

// Owners remove someone; anyone can remove themselves (leave)
router.post('/:id/members/:userId/remove', async (req, res, next) => {
  try {
    const role = await groupRole(req.params.id, req.user.sub);
    if (!role) return next(notFound());
    const leaving = req.params.userId === req.user.sub;
    if (!leaving && !can(role, 'manageMembers')) return next(forbidden("Only the group's owners can remove people."));
    try {
      await groupService.removeMember(req.params.id, req.params.userId);
    } catch (err) {
      if (err instanceof GroupError) return renderGroup(req, res, req.params.id, err.message, 409);
      throw err;
    }
    res.redirect(303, leaving ? '/groups' : `/groups/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/:id/invite/reset', async (req, res, next) => {
  try {
    const role = await groupRole(req.params.id, req.user.sub);
    if (!role) return next(notFound());
    if (!can(role, 'invite')) return next(forbidden("Only the group's organizers and owners can manage invites."));
    await groupService.resetInviteCode(req.params.id);
    res.redirect(303, `/groups/${req.params.id}#invite`);
  } catch (err) { next(err); }
});

router.post('/:id/delete', async (req, res, next) => {
  try {
    const role = await groupRole(req.params.id, req.user.sub);
    const group = await groupService.findById(req.params.id);
    if (!role || !group) return next(notFound());
    if (!can(role, 'manageGroup')) return next(forbidden("Only the group's owners can delete it."));
    // Typing the name guards against deleting every game and score by accident
    if (cleanName(req.body.confirm_name).toLowerCase() !== cleanName(group.name).toLowerCase()) {
      return renderGroup(req, res, req.params.id, `Type "${group.name}" exactly to delete the group.`, 400);
    }
    await groupService.remove(req.params.id);
    res.redirect(303, '/groups');
  } catch (err) { next(err); }
});

export default router;
