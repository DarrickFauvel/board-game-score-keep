import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { authService } from '../services/authService.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/login', (_req, res) => {
  res.renderEta('auth/login', { title: 'Sign In', error: null });
});

router.post('/login', authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).renderEta('auth/login', { title: 'Sign In', error: 'Invalid email or password.' });
      }
      const { email, password } = req.body as { email: string; password: string };
      const token = await authService.login(email, password);
      if (!token) {
        return res.status(401).renderEta('auth/login', { title: 'Sign In', error: 'Invalid email or password.' });
      }
      res.cookie('token', token, cookieOptions());
      res.redirect(303, '/');
    } catch (err) { next(err); }
  }
);

router.get('/register', (_req, res) => {
  res.renderEta('auth/register', { title: 'Create Account', error: null });
});

router.post('/register', authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 10, max: 128 }).matches(/[a-zA-Z]/).matches(/[0-9]/),
  body('display_name').trim().isLength({ min: 1, max: 60 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).renderEta('auth/register', {
          title: 'Create Account',
          error: 'Password must be 10–128 characters and include at least one letter and one number.',
        });
      }
      const { email, password, display_name } = req.body as { email: string; password: string; display_name: string };
      const result = await authService.register(email, password, display_name);
      if (!result.ok) {
        return res.status(409).renderEta('auth/register', { title: 'Create Account', error: result.error });
      }
      res.cookie('token', result.token, cookieOptions());
      res.redirect(303, '/');
    } catch (err) { next(err); }
  }
);

router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.redirect('/auth/login');
});

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export default router;
