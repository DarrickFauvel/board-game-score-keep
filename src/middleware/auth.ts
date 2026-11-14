import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Where to go after signing in: a path on this site only. Anything else
 * (another site, "//host", a backslash trick) falls back to the home page.
 */
export function safeNext(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  return /^\/(?![/\\])[^\s]*$/.test(raw) && !raw.startsWith('/auth/') ? raw : '/';
}

/** The sign-in page, remembering the page someone was trying to open (e.g. an invite link). */
function loginRedirect(req: Request) {
  const next = req.method === 'GET' ? safeNext(req.originalUrl) : '/';
  return next === '/' ? '/auth/login' : `/auth/login?next=${encodeURIComponent(next)}`;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;
  if (!token) { res.redirect(loginRedirect(req)); return; }
  try {
    req.user = jwt.verify(token, config.jwtSecret) as Express.Request['user'];
    next();
  } catch {
    res.clearCookie('token');
    res.redirect(loginRedirect(req));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret) as Express.Request['user'];
    } catch { /* ignore */ }
  }
  next();
}
