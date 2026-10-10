// Send caps for the optional emails. An open email field lets anyone make us
// send mail to any address, so every send first reserves a slot here.

const MAX_EMAIL_LENGTH = 254;
// Mirrored by `isValidEmail` in src/lib/email.ts; keep the two in step.
// One plain address: no spaces, no display name, no list separators, and a
// domain with at least one dot.
const EMAIL_RE = /^[^\s@<>(),;:"[\]\\]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export const PER_ADDRESS_CAP = 3;
// Below the overall cap, so one busy event cannot use the whole day's allowance.
export const PER_EVENT_CAP = 50;
export const DEFAULT_DAILY_CAP = 80;

/** The address as it is sent and hashed, or null if it is not one plain address. */
export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) return null;
  return email;
}

/**
 * Keyed fingerprint of an address, which is all the caps table ever holds.
 * The key is the Resend API key under a fixed label, so the hash cannot be
 * reversed by guessing addresses without it, and no extra secret is needed.
 */
export async function hashAddress(secret: string, address: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`simple-events/email-cap:${address}`));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The inbox an address delivers to, as far as the per-address cap can tell.
 * A plus-tag never changes the inbox, and Gmail ignores dots, so without this
 * one person could be sent the whole day's allowance under different spellings.
 * Only used for counting: the email still goes to the address as typed.
 */
function capKey(address: string): string {
  const at = address.lastIndexOf("@");
  let local = address.slice(0, at).split("+")[0];
  let domain = address.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/**
 * Reserve one send, or return null if any 24-hour cap is already reached. The
 * check and the insert are one statement, so concurrent requests cannot both
 * take the last slot. The row is kept even if the send then fails, so failures
 * count against the caps too.
 */
export async function reserveSend(
  db: D1Database, secret: string, address: string, eventId: string, dailyCap: number,
): Promise<string | null> {
  const id = crypto.randomUUID();
  const hash = await hashAddress(secret, capKey(address));
  const result = await db.prepare(
    `INSERT INTO email_sends (id, address_hash, event_id)
     SELECT ?1, ?2, ?3
     WHERE (SELECT COUNT(*) FROM email_sends WHERE address_hash = ?2 AND sent_at > datetime('now', '-1 day')) < ?4
       AND (SELECT COUNT(*) FROM email_sends WHERE event_id = ?3 AND sent_at > datetime('now', '-1 day')) < ?5
       AND (SELECT COUNT(*) FROM email_sends WHERE sent_at > datetime('now', '-1 day')) < ?6`
  ).bind(id, hash, eventId, PER_ADDRESS_CAP, PER_EVENT_CAP, dailyCap).run();
  return result.meta.changes > 0 ? id : null;
}

/**
 * Drop rows the 24-hour caps no longer look at. Run nightly by the cleanup
 * worker, so a row written just after one run goes at the run after next: the
 * longest a fingerprint lives is 48 hours, which is what the privacy notice says.
 */
export async function purgeOldSends(db: D1Database): Promise<number> {
  const result = await db.prepare("DELETE FROM email_sends WHERE sent_at < datetime('now', '-1 day')").run();
  return result.meta.changes;
}
