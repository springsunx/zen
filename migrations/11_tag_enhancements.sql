-- Tag enhancements: sort order, hierarchy, and color
ALTER TABLE tags ADD COLUMN sort_order INTEGER DEFAULT NULL;

ALTER TABLE tags ADD COLUMN parent_id INTEGER DEFAULT NULL REFERENCES tags(tag_id);

CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON tags(parent_id);

ALTER TABLE tags ADD COLUMN color TEXT DEFAULT NULL;
