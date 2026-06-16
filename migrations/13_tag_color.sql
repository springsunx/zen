-- Add color column to tags for colored badge display
ALTER TABLE tags ADD COLUMN color TEXT DEFAULT NULL;
