/**
 * A record of events created on this device, so a host who closes the tab
 * without saving their admin link can still find it.
 *
 * This is a convenience, not a backup: it is per-browser, it is wiped by
 * clearing site data, and Safari evicts local storage after seven days without
 * a visit. The UI should say "on this device" and never imply the links are
 * recoverable any other way.
 */

const STORAGE_KEY = "simple_events_created";
const MAX_ENTRIES = 100;
/** Matches the server-side retention window for events. */
const RETENTION_DAYS = 90;

export interface StoredEvent {
  id: string;
  name: string;
  event_date: string;
  admin_token: string;
  /** Absolute guest URL. Carries the "#password" fragment when one was embedded. */
  guest_link: string;
  /** ISO timestamp of when this entry was first saved. */
  saved_at: string;
}

function isStoredEvent(value: unknown): value is StoredEvent {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    typeof e.event_date === "string" &&
    typeof e.admin_token === "string" &&
    typeof e.guest_link === "string" &&
    typeof e.saved_at === "string"
  );
}

/** Events past the retention window are gone server-side, so drop them here too. */
function isExpired(event: StoredEvent, now: Date): boolean {
  const eventDay = new Date(`${event.event_date}T00:00:00`);
  if (Number.isNaN(eventDay.getTime())) return false;
  const expiry = new Date(eventDay);
  expiry.setDate(expiry.getDate() + RETENTION_DAYS);
  return now > expiry;
}

/** Every event saved on this device, soonest first, with expired entries dropped. */
export function getMyEvents(now = new Date()): StoredEvent[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return []; // storage disabled (private mode, blocked cookies)
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(isStoredEvent)
    .filter((e) => !isExpired(e, now))
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
}

function write(events: StoredEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(0, MAX_ENTRIES)));
  } catch {
    // Quota exceeded or storage disabled. Losing the convenience copy is not
    // worth breaking event creation over.
  }
}

/**
 * Save or refresh an event.
 *
 * A guest link without a "#password" fragment never overwrites one that has it:
 * the admin page can only reconstruct the bare link, since the password is
 * hashed server-side and cannot be read back.
 */
export function saveMyEvent(event: Omit<StoredEvent, "saved_at">, now = new Date()): void {
  const existing = getMyEvents(now);
  const previous = existing.find((e) => e.id === event.id);

  const guest_link =
    previous && previous.guest_link.includes("#") && !event.guest_link.includes("#")
      ? previous.guest_link
      : event.guest_link;

  const merged: StoredEvent = {
    ...event,
    guest_link,
    saved_at: previous?.saved_at ?? now.toISOString(),
  };

  write([merged, ...existing.filter((e) => e.id !== event.id)]);
}

export function removeMyEvent(id: string, now = new Date()): void {
  write(getMyEvents(now).filter((e) => e.id !== id));
}

/** The stored copy of one event, if this device created (or later opened) it. */
export function getMyEvent(id: string, now = new Date()): StoredEvent | undefined {
  return getMyEvents(now).find((e) => e.id === id);
}

export function adminLinkFor(event: StoredEvent, origin = window.location.origin): string {
  return `${origin}/admin/${event.id}?token=${event.admin_token}`;
}
