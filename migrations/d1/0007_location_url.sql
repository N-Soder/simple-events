-- Optional link for the location: a map pin, a venue page, a meeting URL.
--
-- Kept separate from `location` so the address stays readable text and the link
-- can be validated as a URL. Only http and https are accepted, since the value
-- is rendered as an anchor on a page other people visit.
ALTER TABLE events ADD COLUMN location_url TEXT;
