import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;
  if (!token) { res.redirect('/auth/login'); return; }
  try {
    req.user = jwt.verify(token, config.jwtSecret) as Express.Request['user'];
    next();
  } catch {
    res.clearCookie('token');
    res.redirect('/auth/login');
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
