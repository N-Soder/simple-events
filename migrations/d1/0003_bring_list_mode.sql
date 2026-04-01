ALTER TABLE events ADD COLUMN bring_list_mode TEXT NOT NULL DEFAULT 'open'
  CHECK(bring_list_mode IN ('signup', 'open'));
