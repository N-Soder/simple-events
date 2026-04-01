-- Replace N-rows-per-slot pattern with a single row per item + separate commitments table.
-- bring_list_items: one row per item type, quantity = host's target (was always 1 before, now used properly)
-- bring_commitments: one row per guest commitment, linked to rsvp + item

CREATE TABLE IF NOT EXISTS bring_commitments (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES bring_list_items(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rsvp_id TEXT NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bring_commitments_event_id ON bring_commitments(event_id);
CREATE INDEX IF NOT EXISTS idx_bring_commitments_item_id ON bring_commitments(item_id);
CREATE INDEX IF NOT EXISTS idx_bring_commitments_rsvp_id ON bring_commitments(rsvp_id);
