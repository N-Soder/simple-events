-- One row per email the app has tried to send, kept for at most 48 hours so the daily
-- send caps can be enforced. The address itself is never stored: address_hash
-- is a keyed HMAC of it (see server/email/limits.ts). Deliberately no foreign
-- key to events, so deleting an event does not reset the caps.
CREATE TABLE email_sends (
  id TEXT PRIMARY KEY,
  address_hash TEXT NOT NULL,
  event_id TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_email_sends_address ON email_sends(address_hash, sent_at);
CREATE INDEX idx_email_sends_event ON email_sends(event_id, sent_at);
CREATE INDEX idx_email_sends_sent_at ON email_sends(sent_at);
