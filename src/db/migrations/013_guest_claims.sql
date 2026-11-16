-- A one-time code an organizer shares so a friend can claim a guest's games
-- as their own account. Claiming deletes the guest, so the code works once.
ALTER TABLE players ADD COLUMN claim_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_claim_code ON players(claim_code) WHERE claim_code IS NOT NULL;
