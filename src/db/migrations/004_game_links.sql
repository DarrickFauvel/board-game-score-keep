-- Optional links for a game: its BoardGameGeek page and its rulebook
ALTER TABLE games ADD COLUMN bgg_url TEXT;

ALTER TABLE games ADD COLUMN rules_url TEXT;
