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

export async function runMigrations() {
  const sql = readFileSync(join(__dirname, 'migrations/001_initial.sql'), 'utf8');
  await db.executeMultiple(sql);
  console.log('Database migrations complete.');
}
