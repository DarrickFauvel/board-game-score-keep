import type { Request, Response, NextFunction } from 'express';
import { groupService } from '../services/groupService.js';
import { playerService } from '../services/playerService.js';

export const GROUP_COOKIE = 'group';

/**
 * Picks the group the signed-in person is looking at: the one in the "group"
 * cookie if they're still a member, otherwise their first group. Everyone
 * has at least one; an account without one (e.g. made before groups) gets
 * its own here. Runs after requireAuth.
 */
export async function currentGroup(req: Request, res: Response, next: NextFunction) {
  try {
    let groups = await groupService.listForUser(req.user.sub);
    if (!groups.length) {
      const me = await playerService.findByUserId(req.user.sub);
      await groupService.ensureOwnGroup(req.user.sub, String(me?.display_name ?? ''));
      groups = await groupService.listForUser(req.user.sub);
    }
    const wanted = req.cookies?.[GROUP_COOKIE] as string | undefined;
    const group = groups.find((g) => g.id === wanted) ?? groups[0];
    req.group = group;
    req.groups = groups;
    next();
  } catch (err) { next(err); }
}

export function groupCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 365 * 24 * 60 * 60 * 1000,
  };
}
