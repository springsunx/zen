-- Add parent_id column to support hierarchical tags
ALTER TABLE tags ADD COLUMN parent_id INTEGER DEFAULT NULL REFERENCES tags(tag_id);

-- Create index for efficient hierarchy queries
CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON tags(parent_id);
