---
name: dev
description: Start (or restart) the Board Game Score Keep dev server with hot-reload and confirm it is up
disable-model-invocation: true
---

# /dev — start the dev server

Start the nodemon dev server in the background and report when it is ready. If `$ARGUMENTS` is `stop`, only do the **Stop** step. If it is `restart`, do **Stop** then **Start**.

## 1. Ensure `.env`

If `.env` is missing at the project root, create it from the example and point it at a local SQLite file (the example ships a placeholder Turso cloud URL that 404s):

```bash
[ -f .env ] || { cp .env.example .env && sed -i -E 's#^TURSO_URL=.*#TURSO_URL=file:./board_game_keep.db#; s#^TURSO_AUTH_TOKEN=.*#TURSO_AUTH_TOKEN=#' .env; }
```

## 2. Check whether it is already running

```bash
curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/auth/login
```

If this returns `200` and the argument isn't `restart`, tell the user the server is already running at http://localhost:3000 and stop here — nodemon already hot-reloads on changes.

## Stop

```bash
kill $(cat /tmp/bgsk.pid) 2>/dev/null; pkill -f "[n]odemon src/server.ts"; pkill -f "[t]sx src/server.ts"; rm -f /tmp/bgsk.pid
```

The `[n]`/`[t]` brackets keep `pkill -f` from matching (and killing) the shell running this command.

## Start

```bash
npm run dev &> /tmp/bgsk.log &
echo $! > /tmp/bgsk.pid
for i in {1..40}; do grep -qE "running at|crashed" /tmp/bgsk.log && break; sleep 0.5; done
curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/auth/login
```

- `200` → report: running at http://localhost:3000, logs in `/tmp/bgsk.log`, stop with `/dev stop`.
- Anything else → show the last 30 lines of `/tmp/bgsk.log` and diagnose (common causes: port 3000 in use, missing `JWT_SECRET`/`TURSO_URL` in `.env`).
