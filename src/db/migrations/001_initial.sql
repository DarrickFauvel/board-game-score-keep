PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS players (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name    TEXT NOT NULL,
  avatar_url      TEXT,
  preferred_color TEXT,
  preferred_token TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS games (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  image_url       TEXT,
  scoring_mode    TEXT NOT NULL CHECK (scoring_mode IN ('tally','final','categories')),
  teams_mode      TEXT NOT NULL DEFAULT 'none' CHECK (teams_mode IN ('none','adhoc','profiles')),
  color_primary   TEXT,
  color_secondary TEXT,
  color_accent    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS score_categories (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS teams (
  id      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  color   TEXT
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, player_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  note         TEXT,
  photo_url    TEXT,
  started_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS session_participants (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id    TEXT REFERENCES players(id) ON DELETE SET NULL,
  team_id      TEXT REFERENCES teams(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  color        TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS score_entries (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
  category_id    TEXT REFERENCES score_categories(id) ON DELETE SET NULL,
  round          INTEGER,
  value          REAL NOT NULL DEFAULT 0,
  entered_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  entered_by     TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_game         ON sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_score_entries_session  ON score_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_score_entries_participant ON score_entries(participant_id);
CREATE INDEX IF NOT EXISTS idx_players_user           ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_player    ON team_members(player_id);
CREATE INDEX IF NOT EXISTS idx_participants_session   ON session_participants(session_id);

CREATE VIEW IF NOT EXISTS player_stats AS
SELECT
  p.id            AS player_id,
  p.display_name,
  p.avatar_url,
  p.preferred_color,
  COUNT(DISTINCT sp.session_id) AS games_played,
  SUM(CASE WHEN w.participant_id = sp.id THEN 1 ELSE 0 END) AS wins
FROM players p
LEFT JOIN session_participants sp ON sp.player_id = p.id
LEFT JOIN (
  SELECT session_id, participant_id FROM (
    SELECT
      se.session_id,
      se.participant_id,
      RANK() OVER (PARTITION BY se.session_id ORDER BY SUM(se.value) DESC) AS rnk
    FROM score_entries se
    JOIN sessions s ON s.id = se.session_id AND s.status = 'completed'
    GROUP BY se.session_id, se.participant_id
  ) WHERE rnk = 1
) w ON w.session_id = sp.session_id
GROUP BY p.id;
