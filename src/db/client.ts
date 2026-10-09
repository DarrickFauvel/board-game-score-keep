import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const db = createClient({
  url: config.tursoUrl,
  authToken: config.tursoAuthToken,
});

export async function runMigrations(): Promise<void> {
  // WAL only applies to local SQLite files; Turso rejects journal_mode pragmas.
  if (config.tursoUrl.startsWith('file:')) {
    await db.execute('PRAGMA journal_mode = WAL');
  }
  const sql = readFileSync(join(__dirname, 'migrations/001_initial.sql'), 'utf8');
  await db.executeMultiple(sql);
  console.log('Database migrations complete.');
}
