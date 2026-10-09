import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
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
  // 001 is idempotent (IF NOT EXISTS throughout) and runs on every boot.
  const sql = readFileSync(join(__dirname, 'migrations/001_initial.sql'), 'utf8');
  await db.executeMultiple(sql);

  // Later migrations (e.g. ALTER TABLE) can't safely re-run, so each is applied
  // once, atomically, and recorded in schema_migrations.
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const applied = new Set(
    (await db.execute('SELECT name FROM schema_migrations')).rows.map((r) => String(r.name)),
  );
  const pending = readdirSync(join(__dirname, 'migrations'))
    .filter((f) => f.endsWith('.sql') && f !== '001_initial.sql' && !applied.has(f))
    .sort();
  for (const file of pending) {
    // Statements are split on a trailing semicolon, so keep these files to plain
    // DDL (no triggers or semicolons inside strings).
    const statements = readFileSync(join(__dirname, 'migrations', file), 'utf8')
      .split(/;\s*$/m)
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);
    await db.batch(
      [...statements, { sql: 'INSERT INTO schema_migrations (name) VALUES (?)', args: [file] }],
      'write',
    );
    console.log(`Applied migration ${file}`);
  }
  console.log('Database migrations complete.');
}
