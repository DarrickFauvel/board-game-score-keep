-- Optional "first to N points" end: the rulebook's target on the game, and the
-- target chosen for each session (both optional, running-tally games only)
ALTER TABLE games ADD COLUMN target_score INTEGER;

ALTER TABLE sessions ADD COLUMN target_score INTEGER;
