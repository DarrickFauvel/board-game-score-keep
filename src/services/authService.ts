import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../db/client.js';
import { config } from '../config.js';

type AuthResult = { ok: true; token: string } | { ok: false; error: string };

export const authService = {
  async register(email: string, password: string, displayName: string): Promise<AuthResult> {
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email],
    });
    if (existing.rows.length > 0) {
      return { ok: false, error: 'An account with that email already exists.' };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.execute({
      sql: 'INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id',
      args: [email, passwordHash],
    });
    const userId = result.rows[0].id as string;

    await db.execute({
      sql: 'INSERT INTO players (user_id, display_name) VALUES (?, ?)',
      args: [userId, displayName],
    });

    const token = jwt.sign({ sub: userId, email }, config.jwtSecret, { expiresIn: '7d' });
    return { ok: true, token };
  },

  async login(email: string, password: string): Promise<string | null> {
    const result = await db.execute({
      sql: 'SELECT id, password_hash FROM users WHERE email = ?',
      args: [email],
    });
    if (result.rows.length === 0) return null;

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash as string);
    if (!match) return null;

    return jwt.sign({ sub: user.id, email }, config.jwtSecret, { expiresIn: '7d' });
  },
};
