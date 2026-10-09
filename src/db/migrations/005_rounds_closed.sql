-- How many tally rounds have been finished with Next Round. NULL for sessions
-- started before this column, which keep the older "everyone has a score" rule
-- until their next Next Round.
ALTER TABLE sessions ADD COLUMN rounds_closed INTEGER;
