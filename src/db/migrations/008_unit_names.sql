-- What a game calls its rounds and points (singular, e.g. "race", "victory
-- point"); NULL means the defaults, "round" and "point"
ALTER TABLE games ADD COLUMN round_name TEXT;

ALTER TABLE games ADD COLUMN point_name TEXT;
