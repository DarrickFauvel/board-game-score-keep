-- Guests become real players that belong to a group (group_id set, user_id
-- NULL), so every non-team participant links to a player instead of the app
-- guessing who's who by name. Account players keep group_id NULL.
ALTER TABLE players ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE CASCADE;

-- Set when an organizer hides a guest from suggestions; history is kept
ALTER TABLE players ADD COLUMN hidden_at TEXT;

-- One guest per group and name (ignoring capitals and outer spaces), taking
-- the spelling and colour from that guest's most recent session. Ad-hoc team
-- games are skipped: their rows are team names, not people.
INSERT INTO players (group_id, display_name, preferred_color)
SELECT g.group_id,
       (SELECT trim(sp2.display_name)
          FROM session_participants sp2
          JOIN sessions s2 ON s2.id = sp2.session_id
          JOIN games g2 ON g2.id = s2.game_id
         WHERE g2.group_id = g.group_id AND g2.teams_mode <> 'adhoc'
           AND sp2.player_id IS NULL AND sp2.team_id IS NULL
           AND lower(trim(sp2.display_name)) = lower(trim(sp.display_name))
         ORDER BY s2.started_at DESC LIMIT 1),
       (SELECT sp2.color
          FROM session_participants sp2
          JOIN sessions s2 ON s2.id = sp2.session_id
          JOIN games g2 ON g2.id = s2.game_id
         WHERE g2.group_id = g.group_id AND g2.teams_mode <> 'adhoc'
           AND sp2.player_id IS NULL AND sp2.team_id IS NULL AND sp2.color IS NOT NULL
           AND lower(trim(sp2.display_name)) = lower(trim(sp.display_name))
         ORDER BY s2.started_at DESC LIMIT 1)
  FROM session_participants sp
  JOIN sessions s ON s.id = sp.session_id
  JOIN games g ON g.id = s.game_id
 WHERE g.teams_mode <> 'adhoc' AND g.group_id IS NOT NULL
   AND sp.player_id IS NULL AND sp.team_id IS NULL AND trim(sp.display_name) <> ''
 GROUP BY g.group_id, lower(trim(sp.display_name));

-- Link each of those session rows to its new guest
UPDATE session_participants
   SET player_id = (
     SELECT p.id
       FROM players p
       JOIN sessions s ON s.id = session_participants.session_id
       JOIN games g ON g.id = s.game_id
      WHERE p.group_id = g.group_id AND p.user_id IS NULL
        AND lower(trim(p.display_name)) = lower(trim(session_participants.display_name))
   )
 WHERE player_id IS NULL AND team_id IS NULL AND trim(display_name) <> ''
   AND session_id IN (SELECT s.id FROM sessions s JOIN games g ON g.id = s.game_id
                       WHERE g.teams_mode <> 'adhoc' AND g.group_id IS NOT NULL);

-- A group's guests have distinct names: adding "Sam" again means the same Sam
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_guest_name ON players(group_id, lower(trim(display_name))) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_players_group ON players(group_id);
