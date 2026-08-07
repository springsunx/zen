CREATE TABLE IF NOT EXISTS shared_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_token TEXT NOT NULL UNIQUE,
    note_id INTEGER NOT NULL,
    expires_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(note_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shared_notes_token ON shared_notes(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_notes_note_id ON shared_notes(note_id);
