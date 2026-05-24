import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './db/client.js';
import { createApp } from './app.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

for (const folder of ['avatars', 'games', 'sessions', 'misc']) {
  mkdirSync(join(__dirname, 'public/uploads', folder), { recursive: true });
}

await runMigrations();

const app = createApp();
app.listen(config.port, () => {
  console.log(`Board Game Score Keep running at ${config.baseUrl}`);
});
