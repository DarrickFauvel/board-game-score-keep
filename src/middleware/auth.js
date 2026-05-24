import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/auth/login');
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.clearCookie('token');
    return res.redirect('/auth/login');
  }
}

export function optionalAuth(req, res, next) {
  const token = req.cookies?.token;
  if (token) {
    try { req.user = jwt.verify(token, config.jwtSecret); } catch { /* ignore */ }
  }
  next();
}
