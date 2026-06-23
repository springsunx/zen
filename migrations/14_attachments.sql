CREATE TABLE IF NOT EXISTS attachments (
    filename       TEXT PRIMARY KEY,
    original_name  TEXT NOT NULL,
    content_type   TEXT NOT NULL,
    file_size      INTEGER NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS note_attachments (
    note_id      INTEGER NOT NULL,
    filename     TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_id, filename),
    FOREIGN KEY (note_id) REFERENCES notes (note_id),
    FOREIGN KEY (filename) REFERENCES attachments (filename)
);

ALTER TABLE storage_config ADD COLUMN attachments_bucket TEXT DEFAULT '';
ALTER TABLE storage_config ADD COLUMN attachments_public_url TEXT DEFAULT '';
