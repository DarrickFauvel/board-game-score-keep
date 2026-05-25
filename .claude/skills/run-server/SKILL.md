---
name: run-server
description: Launch the Board Game Score Keep dev server
---

# Run: Board Game Score Keep dev server

Express + TypeScript app. Uses `tsx` via nodemon for hot-reload. Requires a `.env` file (see below). DB is a local SQLite file by default — no external services needed in dev.

## Prerequisites

`.env` must exist at the project root. If it doesn't, copy the example:

```bash
cp .env.example .env
```

The defaults work for local dev as-is (`TURSO_URL=file:./board_game_keep.db`).

## Run

Launch the dev server in the background:

```bash
npm run dev &> /tmp/bgsk.log &
echo $! > /tmp/bgsk.pid
```

Wait for the ready line, then smoke-test:

```bash
for i in {1..20}; do
  grep -q "running at" /tmp/bgsk.log && break
  sleep 0.5
done

curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/auth/login
# → 200
```

Logs are at `/tmp/bgsk.log`. The server is ready when the log contains:

```
Board Game Score Keep running at http://localhost:3000
```

## Stop

```bash
kill $(cat /tmp/bgsk.pid) 2>/dev/null
# or if the PID file is gone:
pkill -f "tsx src/server.ts"
```

## Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `JWT_SECRET` | Yes | — | Any string works locally; must be ≥ 64 chars in production |
| `TURSO_URL` | Yes | — | `file:./board_game_keep.db` for local SQLite; `libsql://…` for Turso cloud |
| `TURSO_AUTH_TOKEN` | No | — | Only needed for Turso cloud URL |
| `PORT` | No | `3000` | |
| `BASE_URL` | No | `http://localhost:3000` | Used in log output only |
| `NODE_ENV` | No | `development` | Set to `production` to enable template caching and combined morgan logs |

## Modes

| Command | When to use |
|---|---|
| `npm run dev` | Development — nodemon watches `src/**/*.ts,eta,css,sql` and hot-reloads |
| `npm run start` | Production-like — runs `tsx src/server.ts` directly, no watch |
| `npm run typecheck` | Type-check only, no emit |

## Notes

- First boot runs `runMigrations()` which executes `src/db/migrations/001_initial.sql` via `executeMultiple` — safe to run repeatedly (uses `CREATE TABLE IF NOT EXISTS`).
- Upload folders (`src/public/uploads/{avatars,games,sessions,misc}`) are created on startup if missing.
- The `DEP0169` Node deprecation warning on boot comes from `@libsql/client` — not from this codebase.
