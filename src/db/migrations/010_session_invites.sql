-- A secret code for inviting people to an active session: /join/<code>.
-- Created the first time the host opens the session; null until then.
ALTER TABLE sessions ADD COLUMN invite_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_invite ON sessions(invite_code);
