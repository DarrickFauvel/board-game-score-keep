-- Photo captions and who appears in each photo
ALTER TABLE session_photos ADD COLUMN caption TEXT;

CREATE TABLE IF NOT EXISTS session_photo_participants (
  photo_id       TEXT NOT NULL REFERENCES session_photos(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
  PRIMARY KEY (photo_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_session_photo_participants_participant ON session_photo_participants(participant_id);
