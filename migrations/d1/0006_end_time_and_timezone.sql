-- Add an optional end time and the host's IANA time zone.
--
-- Both support calendar export (iCal / Google Calendar). Existing events have
-- NULL for each: a NULL end time falls back to a default duration, and a NULL
-- time zone falls back to a "floating" local time in the .ics, which is how
-- these events have always been interpreted.
ALTER TABLE events ADD COLUMN event_end_time TEXT;
ALTER TABLE events ADD COLUMN timezone TEXT;
