-- Groups (a family, a game night crew) own games and share the work.
-- Roles: owner (everything, incl. members and roles), organizer (games,
-- guests, completing and deleting sessions, inviting), player (play).
CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  invite_code TEXT,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_invite ON groups(invite_code);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('owner','organizer','player')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

-- Every game belongs to a group; owner_id stays as "added by"
ALTER TABLE games ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_games_group ON games(group_id);

-- Everyone starts with their own group, named after them, and owns it
INSERT INTO groups (name, created_by)
SELECT COALESCE((SELECT trim(display_name) FROM players WHERE user_id = u.id LIMIT 1), 'My') || '''s games', u.id
  FROM users u;

INSERT INTO group_members (group_id, user_id, role)
SELECT id, created_by, 'owner' FROM groups WHERE created_by IS NOT NULL;

-- Their games move into it
UPDATE games SET group_id = (SELECT id FROM groups WHERE created_by = games.owner_id LIMIT 1)
 WHERE group_id IS NULL;
