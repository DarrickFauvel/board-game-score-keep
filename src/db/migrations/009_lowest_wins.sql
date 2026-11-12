-- Whether the lowest total wins (Golf, Hearts) instead of the highest: 0 or 1
ALTER TABLE games ADD COLUMN lowest_wins INTEGER NOT NULL DEFAULT 0;

-- player_stats counted the highest total as the win in every game; rank by
-- each game's own rule instead
DROP VIEW IF EXISTS player_stats;

CREATE VIEW player_stats AS
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
      RANK() OVER (
        PARTITION BY se.session_id
        ORDER BY CASE WHEN g.lowest_wins = 1 THEN SUM(se.value) ELSE -SUM(se.value) END
      ) AS rnk
    FROM score_entries se
    JOIN sessions s ON s.id = se.session_id AND s.status = 'completed'
    JOIN games g ON g.id = s.game_id
    GROUP BY se.session_id, se.participant_id
  ) WHERE rnk = 1
) w ON w.session_id = sp.session_id
GROUP BY p.id;
