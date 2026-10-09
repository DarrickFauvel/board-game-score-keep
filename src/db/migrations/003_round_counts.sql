-- Rounds from a game's rules, and the number planned for each session (both optional)
ALTER TABLE games ADD COLUMN suggested_rounds INTEGER;

ALTER TABLE sessions ADD COLUMN planned_rounds INTEGER;
