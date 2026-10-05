-- Tag colors were nullable before the tag colour picker landed. The UI expects a concrete
-- colour value, so normalise the legacy NULLs in place without touching existing choices.
UPDATE tags SET color = 'gray' WHERE color IS NULL;
