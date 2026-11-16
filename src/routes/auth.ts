import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { authService } from '../services/authService.js';
import { safeNext } from '../middleware/auth.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/* What each register field says when it's rejected; shown under that field */
const REGISTER_MESSAGES: Record<string, string> = {
  display_name: 'Enter your name, up to 60 characters.',
  email: 'Enter an email address, like name@example.com.',
  password: 'Use 10 to 128 characters, with at least one letter and one number.',
};

router.get('/login', (_req, res) => {
  res.renderEta('auth/login', { title: 'Sign in', error: null, values: {}, next: safeNext(_req.query.next) });
});

router.post('/login', authLimiter,
  body('email').isEmail().bail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).renderEta('auth/login', { title: 'Sign in', error: 'That email and password don\'t match an account.', values: { email: req.body.email }, next: safeNext(req.body.next) });
      }
      const { email, password } = req.body as { email: string; password: string };
      const token = await authService.login(email, password);
      if (!token) {
        return res.status(401).renderEta('auth/login', { title: 'Sign in', error: 'That email and password don\'t match an account.', values: { email }, next: safeNext(req.body.next) });
      }
      res.cookie('token', token, cookieOptions());
      res.redirect(303, safeNext(req.body.next));
    } catch (err) { next(err); }
  }
);

router.get('/register', (_req, res) => {
  res.renderEta('auth/register', { title: 'Create an account', fieldErrors: {}, values: {}, next: safeNext(_req.query.next) });
});

router.post('/register', authLimiter,
  body('email').isEmail().bail().normalizeEmail(),
  body('password').isLength({ min: 10, max: 128 }).matches(/[a-zA-Z]/).matches(/[0-9]/),
  body('display_name').trim().isLength({ min: 1, max: 60 }),
  async (req, res, next) => {
    try {
      // Typed values go back into the form (never the password)
      const values = { display_name: req.body.display_name, email: req.body.email };
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const fieldErrors: Record<string, string> = {};
        for (const e of errors.array()) {
          if (e.type === 'field' && REGISTER_MESSAGES[e.path]) fieldErrors[e.path] = REGISTER_MESSAGES[e.path];
        }
        return res.status(400).renderEta('auth/register', { title: 'Create an account', fieldErrors, values, next: safeNext(req.body.next) });
      }
      const { email, password, display_name } = req.body as { email: string; password: string; display_name: string };
      const result = await authService.register(email, password, display_name);
      if (!result.ok) {
        // The one way registering fails here: the email already has an account
        return res.status(409).renderEta('auth/register', { title: 'Create an account', fieldErrors: { email: result.error }, values, next: safeNext(req.body.next) });
      }
      res.cookie('token', result.token, cookieOptions());
      res.redirect(303, safeNext(req.body.next));
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
