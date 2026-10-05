-- Tag colours were born nullable and were later written as an empty string by the tag editor.
-- The renderer expects a concrete colour value, so fold both spellings into the neutral default.
UPDATE tags SET color = 'gray' WHERE color IS NULL OR color = '';
