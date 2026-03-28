CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  event_date TEXT NOT NULL,
  event_time TEXT,
  location TEXT,
  banner_url TEXT,
  password_hash TEXT,
  guest_visibility TEXT NOT NULL DEFAULT 'full' CHECK(guest_visibility IN ('full', 'count_only', 'hidden')),
  admin_token TEXT NOT NULL,
  bring_list_enabled INTEGER NOT NULL DEFAULT 1,
  bring_list_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rsvps (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  kids INTEGER NOT NULL DEFAULT 0,
  manage_code TEXT NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bring_list_items (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  claimed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_bring_list_items_event_id ON bring_list_items(event_id);
