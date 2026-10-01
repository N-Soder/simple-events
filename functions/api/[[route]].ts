import {
  deleteUploadIfUnreferenced,
  isAllowedBannerUrl,
  uploadUrlFor,
} from "../../server/banners";
import { accessTokenFor, checkPassword, hashPassword, isValidAccessToken } from "../../server/password";

interface Env {
  DB: D1Database;
  R2: R2Bucket;
  R2_PUBLIC_URL?: string;
}

// The SPA is served same-origin, so no CORS is required. We only emit
// hardening headers. (If you ever need cross-origin API access, add an
// explicit Access-Control-Allow-Origin allow-list here.)
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const VISIBILITIES = ["full", "count_only", "hidden"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const MAX_URL_LENGTH = 2000;
const MAX_PASSWORD_LENGTH = 100;
// Upper bounds on list inputs. Far above anything the UI sends, low enough that
// one request cannot turn into thousands of statements.
const MAX_BRING_ITEMS = 100;
const MAX_CLAIMS_PER_REQUEST = 50;
const MAX_SLOTS_PER_ITEM = 20;
const MAX_NOTE_LENGTH = 150;

// Guests send the access token from POST /api/verify in this header on reads,
// and as `access_token` in the body on writes. The password itself only ever
// travels to /verify, and never in a URL.
const ACCESS_HEADER = "X-Event-Access";

// The location link is rendered as an anchor on the guest page, so only plain
// web schemes are stored. This keeps "javascript:" and "data:" payloads out of
// the database rather than relying on the client to filter them at render time.
function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > MAX_URL_LENGTH) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Reject anything that isn't a time zone the runtime actually knows about, so a
// bad value can't be stored and later break date maths on the client.
function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Allowed banner image types → canonical file extension. SVG is intentionally
// excluded because it can carry script and would be served from our origin.
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};
// The browser resizes a banner to at most 1600 px wide and re-encodes it as
// WebP before uploading (`src/lib/bannerImage.ts`), so a real banner arrives
// here at well under 200 KB and only an uncropped GIF or a hand-crafted request
// gets near this limit. Keep it in step with `MAX_UPLOAD_BYTES` on the client,
// which is what stops a host being told their photo is too big after they have
// filled in the whole form.
const MAX_BANNER_BYTES = 5 * 1024 * 1024; // 5 MB

// Thrown by validation and access checks; turned into a JSON error response.
class HttpError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...securityHeaders, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// ---- Input parsing. Each helper returns undefined for an absent field and
// rejects a present field of the wrong type, so a malformed request is a 400
// rather than a crash (500) or a wrongly typed value written to the database.

async function readJson(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError("Request body must be JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Request body must be a JSON object");
  return body as Record<string, unknown>;
}

function optString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new HttpError(`${field} must be a string`);
  if (value.length > max) throw new HttpError(`${field} must be ${max} characters or fewer`);
  return value;
}

function reqString(value: unknown, field: string, max: number): string {
  const s = optString(value, field, max)?.trim();
  if (!s) throw new HttpError(`${field} is required`);
  return s;
}

/** A whole number clamped to [min, max]; `fallback` when absent. */
function clampedInt(value: unknown, field: string, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new HttpError(`${field} must be a number`);
  return Math.min(Math.max(Math.floor(value), min), max);
}

function optList(value: unknown, field: string, max: number): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new HttpError(`${field} must be a list`);
  if (value.length > max) throw new HttpError(`${field} can have at most ${max} entries`);
  return value;
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(`${field} entries must be objects`);
  return value as Record<string, unknown>;
}

function cleanNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, MAX_NOTE_LENGTH) || null;
}

function optPassword(value: unknown): string | undefined {
  const s = optString(value, "password", MAX_PASSWORD_LENGTH);
  return s ? s : undefined;
}

// ---- Access checks.

interface GuestEvent {
  id: string;
  password_hash: string | null;
  bring_list_enabled: number;
  bring_list_mode: "open" | "signup";
}

/** Load an event for a guest request, enforcing its password via the access token. */
async function requireGuestAccess(db: D1Database, eventId: unknown, accessToken: unknown): Promise<GuestEvent> {
  if (typeof eventId !== "string" || !eventId) throw new HttpError("event_id is required");
  const event = await db
    .prepare("SELECT id, password_hash, bring_list_enabled, bring_list_mode FROM events WHERE id = ?")
    .bind(eventId)
    .first<GuestEvent>();
  if (!event) throw new HttpError("Event not found", 404);
  if (event.password_hash !== null && !(await isValidAccessToken(event.id, event.password_hash, accessToken as string))) {
    throw new HttpError("Invalid password", 403);
  }
  return event;
}

async function requireAdmin<T = { id: string }>(db: D1Database, body: Record<string, unknown>, columns = "id"): Promise<T> {
  const { event_id, admin_token } = body;
  if (typeof event_id !== "string" || typeof admin_token !== "string" || !event_id || !admin_token) {
    throw new HttpError("event_id and admin_token required");
  }
  const event = await db
    .prepare(`SELECT ${columns} FROM events WHERE id = ? AND admin_token = ?`)
    .bind(event_id, admin_token)
    .first<T>();
  if (!event) throw new HttpError("Invalid admin token", 403);
  return event;
}

// ---- Bring list.

// Fetch bring items with aggregated commitments for a given event
async function getBringItems(db: D1Database, eventId: string) {
  const { results: items } = await db.prepare(
    "SELECT id, item_name, quantity FROM bring_list_items WHERE event_id = ? ORDER BY created_at ASC"
  ).bind(eventId).all<{ id: string; item_name: string; quantity: number }>();

  if (items.length === 0) return [];

  const { results: commitments } = await db.prepare(
    "SELECT item_id, guest_name, quantity, note FROM bring_commitments WHERE event_id = ? ORDER BY created_at ASC"
  ).bind(eventId).all<{ item_id: string; guest_name: string; quantity: number; note: string | null }>();

  // Group commitments by item_id
  const commitMap = new Map<string, Array<{ guest_name: string; quantity: number; note: string | null }>>();
  for (const c of commitments) {
    const list = commitMap.get(c.item_id) ?? [];
    list.push({ guest_name: c.guest_name, quantity: c.quantity, note: c.note });
    commitMap.set(c.item_id, list);
  }

  return items.map((item) => {
    const itemCommitments = commitMap.get(item.id) ?? [];
    const committed = itemCommitments.reduce((sum, c) => sum + c.quantity, 0);
    return {
      id: item.id,
      item_name: item.item_name,
      target_quantity: item.quantity,
      committed_quantity: committed,
      commitments: itemCommitments,
    };
  });
}

interface ClaimRequest { item_id: string; qty: number; note: string | null }
interface CustomItemRequest { item_name: string; note: string | null }

function parseClaims(value: unknown, mode: GuestEvent["bring_list_mode"]): ClaimRequest[] {
  return optList(value, "claim_items", MAX_CLAIMS_PER_REQUEST).map((raw) => {
    const c = asObject(raw, "claim_items");
    if (typeof c.item_id !== "string" || !c.item_id) throw new HttpError("claim_items entries need an item_id");
    // Open mode has no concept of slots, so every claim is one.
    const qty = mode === "open" ? 1 : clampedInt(c.quantity, "quantity", 1, MAX_SLOTS_PER_ITEM, 1);
    return { item_id: c.item_id, qty, note: cleanNote(c.note) };
  });
}

function parseCustomItems(value: unknown, mode: GuestEvent["bring_list_mode"]): CustomItemRequest[] {
  const list = optList(value, "custom_items", MAX_CLAIMS_PER_REQUEST);
  if (list.length > 0 && mode === "signup") throw new HttpError("Custom items are not allowed in Sign-up Sheet mode", 403);
  const items: CustomItemRequest[] = [];
  for (const raw of list) {
    const c = asObject(raw, "custom_items");
    const name = optString(c.item_name, "item_name", 200)?.trim();
    if (name) items.push({ item_name: name, note: cleanNote(c.note) });
  }
  return items;
}

/**
 * Check requested claims against the current bring list before anything is
 * written, so a full slot is a clean 409 the guest can react to rather than a
 * half-applied RSVP. `released` is what this RSVP is giving up in the same
 * request (an edit re-submits every claim). Claims on items the host has since
 * deleted are dropped.
 */
async function checkClaims(
  db: D1Database,
  event: GuestEvent,
  claims: ClaimRequest[],
  released: Map<string, number> = new Map(),
): Promise<Array<ClaimRequest & { item_name: string }>> {
  if (claims.length === 0) return [];
  const { results } = await db.prepare(
    `SELECT i.id, i.item_name, i.quantity, COALESCE(SUM(c.quantity), 0) AS committed
     FROM bring_list_items i LEFT JOIN bring_commitments c ON c.item_id = i.id
     WHERE i.event_id = ? GROUP BY i.id`
  ).bind(event.id).all<{ id: string; item_name: string; quantity: number; committed: number }>();
  const items = new Map(results.map((r) => [r.id, r]));

  const added = new Map<string, number>();
  const valid: Array<ClaimRequest & { item_name: string }> = [];
  for (const claim of claims) {
    const item = items.get(claim.item_id);
    if (!item) continue;
    if (event.bring_list_mode === "signup") {
      const total = item.committed - (released.get(item.id) ?? 0) + (added.get(item.id) ?? 0) + claim.qty;
      if (total > item.quantity) throw new HttpError(`"${item.item_name}" is already full`, 409);
      added.set(item.id, (added.get(item.id) ?? 0) + claim.qty);
    }
    valid.push({ ...claim, item_name: item.item_name });
  }
  return valid;
}

/**
 * Insert a commitment only if the item still has room when the statement runs.
 * `checkClaims` catches the normal case up front; this closes the gap between
 * that check and the write, when two guests take the last slot at once. A claim
 * that loses the race inserts nothing, and the caller reports it.
 */
function claimStatement(db: D1Database, eventId: string, rsvpId: string, guestName: string, claim: ClaimRequest, capped: boolean) {
  return db.prepare(
    `INSERT INTO bring_commitments (id, item_id, event_id, rsvp_id, guest_name, quantity, note)
     SELECT ?, i.id, i.event_id, ?, ?, ?, ?
     FROM bring_list_items i
     WHERE i.id = ? AND i.event_id = ?
       AND (? = 0 OR (SELECT COALESCE(SUM(c.quantity), 0) FROM bring_commitments c WHERE c.item_id = i.id) + ? <= i.quantity)`
  ).bind(crypto.randomUUID(), rsvpId, guestName, claim.qty, claim.note, claim.item_id, eventId, capped ? 1 : 0, claim.qty);
}

function customItemStatements(db: D1Database, eventId: string, rsvpId: string, guestName: string, item: CustomItemRequest) {
  const itemId = crypto.randomUUID();
  return [
    db.prepare("INSERT INTO bring_list_items (id, event_id, item_name, quantity) VALUES (?, ?, ?, 1)")
      .bind(itemId, eventId, item.item_name),
    db.prepare(
      "INSERT INTO bring_commitments (id, item_id, event_id, rsvp_id, guest_name, quantity, note) VALUES (?, ?, ?, ?, ?, 1, ?)"
    ).bind(crypto.randomUUID(), itemId, eventId, rsvpId, guestName, item.note),
  ];
}

/**
 * Append claim and custom-item statements to a batch, and return a function that
 * reads the batch results back into what was actually reserved.
 */
function appendBringStatements(
  db: D1Database,
  statements: D1PreparedStatement[],
  event: GuestEvent,
  rsvpId: string,
  guestName: string,
  claims: Array<ClaimRequest & { item_name: string }>,
  customItems: CustomItemRequest[],
) {
  const claimIndexes = claims.map((claim) => {
    statements.push(claimStatement(db, event.id, rsvpId, guestName, claim, event.bring_list_mode === "signup"));
    return statements.length - 1;
  });
  for (const item of customItems) statements.push(...customItemStatements(db, event.id, rsvpId, guestName, item));

  return (results: D1Result[]) => [
    ...claims
      .filter((_, i) => (results[claimIndexes[i]]?.meta.changes ?? 0) > 0)
      .map((c) => ({ item_name: c.item_name, quantity: c.qty })),
    ...customItems.map((c) => ({ item_name: c.item_name, quantity: 1 })),
  ];
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: securityHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const db = env.DB;

  try {
    // POST /api/upload - Upload banner to R2
    if (request.method === "POST" && path === "upload") {
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return err("Request body must be multipart form data");
      }
      // Typed as string by workers-types, but a file field arrives as a File.
      const file: unknown = formData.get("file");
      if (!(file instanceof File)) return err("file is required");

      const ext = ALLOWED_IMAGE_TYPES[file.type];
      if (!ext) return err("Unsupported image type. Use JPEG, PNG, GIF, WebP, or AVIF.", 415);
      if (file.size > MAX_BANNER_BYTES) return err("Image must be 5 MB or smaller", 413);

      const key = `${crypto.randomUUID()}.${ext}`;
      await env.R2.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });
      return json({ url: uploadUrlFor(key, env.R2_PUBLIC_URL) });
    }

    // POST /api/create - Create a new event
    if (request.method === "POST" && path === "create") {
      const body = await readJson(request);
      const name = reqString(body.name, "name", 200);
      const event_date = reqString(body.event_date, "event_date", 10);
      if (!DATE_RE.test(event_date)) return err("event_date must be in YYYY-MM-DD format");
      const event_time = optString(body.event_time, "event_time", 5) || undefined;
      const event_end_time = optString(body.event_end_time, "event_end_time", 5) || undefined;
      if (event_time && !TIME_RE.test(event_time)) return err("event_time must be in HH:MM format");
      if (event_end_time && !TIME_RE.test(event_end_time)) return err("event_end_time must be in HH:MM format");
      if (event_end_time && !event_time) return err("event_end_time requires event_time");
      if (body.timezone !== undefined && body.timezone !== null && !isValidTimeZone(body.timezone)) return err("invalid timezone");
      const description = optString(body.description, "description", 5000);
      const location = optString(body.location, "location", 500);
      const location_url = optString(body.location_url, "location_url", MAX_URL_LENGTH) || undefined;
      if (location_url && !isSafeHttpUrl(location_url)) return err("location_url must be an http(s) URL");
      const banner_url = optString(body.banner_url, "banner_url", MAX_URL_LENGTH) || undefined;
      if (banner_url && !isAllowedBannerUrl(banner_url, env.R2_PUBLIC_URL)) return err("banner_url must be an uploaded banner or a preset");
      const bring_list_message = optString(body.bring_list_message, "bring_list_message", 5000);
      const guest_visibility = body.guest_visibility ?? "full";
      if (!VISIBILITIES.includes(guest_visibility as typeof VISIBILITIES[number])) return err("invalid guest_visibility");
      const password = optPassword(body.password);
      const bringItems = optList(body.bring_items, "bring_items", MAX_BRING_ITEMS);

      const id = crypto.randomUUID();
      const admin_token = crypto.randomUUID();
      const password_hash = password ? await hashPassword(password) : null;
      const mode = body.bring_list_mode === "signup" ? "signup" : "open";

      const statements = [db.prepare(
        `INSERT INTO events (id, name, description, event_date, event_time, event_end_time, timezone, location, location_url, banner_url, password_hash, guest_visibility, admin_token, bring_list_enabled, bring_list_message, bring_list_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, name, description ?? null, event_date, event_time ?? null,
        event_end_time ?? null, (body.timezone as string | undefined) ?? null,
        location ?? null, location_url ?? null, banner_url ?? null, password_hash,
        guest_visibility, admin_token,
        body.bring_list_enabled !== false ? 1 : 0,
        bring_list_message ?? null,
        mode
      )];

      // One row per item with its target quantity. In open mode, quantity is
      // always 1 (no concept of slots).
      const itemStmt = db.prepare("INSERT INTO bring_list_items (id, event_id, item_name, quantity) VALUES (?, ?, ?, ?)");
      for (const item of bringItems) {
        const obj = typeof item === "string" ? { name: item } : asObject(item, "bring_items");
        const itemName = (typeof obj.name === "string" ? obj.name.trim().slice(0, 200) : "") || "Item";
        const qty = mode === "open" ? 1 : clampedInt(obj.quantity, "quantity", 1, MAX_SLOTS_PER_ITEM, 1);
        statements.push(itemStmt.bind(crypto.randomUUID(), id, itemName, qty));
      }
      await db.batch(statements);

      return json({ id, admin_token });
    }

    // POST /api/verify - Exchange an event password for an access token
    if (request.method === "POST" && path === "verify") {
      const body = await readJson(request);
      if (typeof body.event_id !== "string" || !body.event_id) return err("event_id is required");
      const eventId = body.event_id;

      const row = await db.prepare("SELECT password_hash FROM events WHERE id = ?").bind(eventId).first<{ password_hash: string | null }>();
      if (!row) return err("Event not found", 404);
      if (row.password_hash === null) return json({ valid: true, access_token: null });
      const password = optPassword(body.password);
      if (!password) return json({ valid: false });

      const { valid, rehash } = await checkPassword(password, row.password_hash);
      if (!valid) return json({ valid: false });

      let hash = row.password_hash;
      if (rehash) {
        // Upgrade a legacy bcrypt hash in place, unless the host changed the
        // password in the meantime.
        const result = await db.prepare("UPDATE events SET password_hash = ? WHERE id = ? AND password_hash = ?")
          .bind(rehash, eventId, row.password_hash).run();
        if (result.meta.changes > 0) hash = rehash;
      }
      return json({ valid: true, access_token: await accessTokenFor(eventId, hash) });
    }

    // GET /api/event?id=... - Guest view (access token in the X-Event-Access header)
    if (request.method === "GET" && path === "event") {
      const event_id = url.searchParams.get("id");
      if (!event_id) return err("id is required");

      // Fetch first so a missing/deleted event returns 404 (not a password prompt).
      const eventRow = await db.prepare(
        "SELECT id, name, description, event_date, event_time, event_end_time, timezone, location, location_url, banner_url, guest_visibility, bring_list_enabled, bring_list_message, bring_list_mode, created_at, password_hash FROM events WHERE id = ?"
      ).bind(event_id).first<Record<string, unknown>>();
      if (!eventRow) return err("Event not found", 404);

      const passwordHash = eventRow.password_hash as string | null;
      if (passwordHash !== null && !(await isValidAccessToken(event_id, passwordHash, request.headers.get(ACCESS_HEADER)))) {
        return err("Invalid password", 403);
      }

      // Never expose the hash to clients.
      const { password_hash: _omit, ...event } = eventRow;
      const visibility = (event.guest_visibility as string) ?? "full";

      const { results: allRsvps } = await db.prepare(
        "SELECT id, guest_name, adults, kids, cancelled, created_at FROM rsvps WHERE event_id = ? ORDER BY created_at ASC"
      ).bind(event_id).all<{ id: string; guest_name: string; adults: number; kids: number; cancelled: number }>();
      const active = allRsvps.filter((r) => !r.cancelled);

      const bringItems = await getBringItems(db, event_id);

      // Enforce guest_visibility server-side: names only leave the server in "full" mode,
      // aggregate counts only in "full"/"count_only", nothing in "hidden".
      const payload: Record<string, unknown> = {
        event: normalizeEvent(event),
        bring_items: bringItems,
      };
      if (visibility !== "hidden") {
        payload.rsvp_counts = {
          count: active.length,
          adults: active.reduce((s, r) => s + r.adults, 0),
          kids: active.reduce((s, r) => s + r.kids, 0),
        };
      }
      if (visibility === "full") {
        payload.rsvps = active.map((r) => ({ id: r.id, guest_name: r.guest_name, adults: r.adults, kids: r.kids }));
      }

      return json(payload);
    }

    // GET /api/admin?id=...&token=... - Admin view
    if (request.method === "GET" && path === "admin") {
      const event_id = url.searchParams.get("id");
      const token = url.searchParams.get("token");
      if (!event_id || !token) return err("id and token are required");

      const row = await db.prepare(
        "SELECT id, name, description, event_date, event_time, event_end_time, timezone, location, location_url, banner_url, guest_visibility, bring_list_enabled, bring_list_message, bring_list_mode, admin_token, created_at, password_hash FROM events WHERE id = ? AND admin_token = ?"
      ).bind(event_id, token).first<Record<string, unknown>>();
      if (!row) return err("Invalid admin link", 403);
      const { password_hash, ...event } = row;

      const { results: rsvps } = await db.prepare(
        "SELECT id, guest_name, adults, kids, cancelled, manage_code, created_at FROM rsvps WHERE event_id = ? ORDER BY created_at ASC"
      ).bind(event_id).all();

      const bringItems = await getBringItems(db, event_id);

      return json({
        event: { ...normalizeEvent(event), has_password: password_hash !== null },
        rsvps: rsvps.map(normalizeRsvp),
        bring_items: bringItems,
      });
    }

    // POST /api/rsvp - Submit an RSVP, with any bring list claims, in one go
    if (request.method === "POST" && path === "rsvp") {
      const body = await readJson(request);
      if (body.honeypot) return json({ success: true });
      const guestName = reqString(body.guest_name, "guest_name", 100);
      const event = await requireGuestAccess(db, body.event_id, body.access_token);

      const adults = clampedInt(body.adults, "adults", 1, 50, 1);
      const kids = clampedInt(body.kids, "kids", 0, 50, 0);
      const listOpen = event.bring_list_enabled === 1;
      const claims = listOpen ? await checkClaims(db, event, parseClaims(body.claim_items, event.bring_list_mode)) : [];
      const customItems = listOpen ? parseCustomItems(body.custom_items, event.bring_list_mode) : [];

      const id = crypto.randomUUID();
      const manage_code = crypto.randomUUID();
      const statements = [db.prepare(
        "INSERT INTO rsvps (id, event_id, guest_name, adults, kids, manage_code) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(id, event.id, guestName, adults, kids, manage_code)];
      const readReserved = appendBringStatements(db, statements, event, id, guestName, claims, customItems);

      const results = await db.batch(statements);
      const row = await db.prepare("SELECT * FROM rsvps WHERE id = ?").bind(id).first();
      return json({ ...normalizeRsvp(row), reserved: readReserved(results) });
    }

    // PUT /api/admin/update - Update event (admin)
    if (request.method === "PUT" && path === "admin/update") {
      const body = await readJson(request);
      const event = await requireAdmin<{ id: string; event_time: string | null; banner_url: string | null }>(
        db, body, "id, event_time, banner_url",
      );

      // Each supplied field is validated and mapped to the value to store.
      // `null` clears an optional field; an absent field is left alone.
      const updates = new Map<string, unknown>();
      if (body.name !== undefined) updates.set("name", reqString(body.name, "name", 200));
      if (body.description !== undefined) updates.set("description", optString(body.description, "description", 5000) ?? null);
      if (body.event_date !== undefined) {
        if (typeof body.event_date !== "string" || !DATE_RE.test(body.event_date)) return err("event_date must be in YYYY-MM-DD format");
        updates.set("event_date", body.event_date);
      }
      for (const field of ["event_time", "event_end_time"] as const) {
        if (body[field] === undefined) continue;
        const value = optString(body[field], field, 5) || null;
        if (value && !TIME_RE.test(value)) return err(`${field} must be in HH:MM format`);
        updates.set(field, value);
      }
      if (body.timezone !== undefined) {
        if (body.timezone !== null && !isValidTimeZone(body.timezone)) return err("invalid timezone");
        updates.set("timezone", body.timezone);
      }
      if (body.location !== undefined) updates.set("location", optString(body.location, "location", 500) ?? null);
      if (body.location_url !== undefined) {
        // An empty box means "no link", which is NULL rather than "".
        const value = optString(body.location_url, "location_url", MAX_URL_LENGTH) || null;
        if (value && !isSafeHttpUrl(value)) return err("location_url must be an http(s) URL");
        updates.set("location_url", value);
      }
      if (body.banner_url !== undefined) {
        const value = optString(body.banner_url, "banner_url", MAX_URL_LENGTH) || null;
        if (value && !isAllowedBannerUrl(value, env.R2_PUBLIC_URL)) return err("banner_url must be an uploaded banner or a preset");
        updates.set("banner_url", value);
      }
      if (body.guest_visibility !== undefined) {
        if (!VISIBILITIES.includes(body.guest_visibility as typeof VISIBILITIES[number])) return err("invalid guest_visibility");
        updates.set("guest_visibility", body.guest_visibility);
      }
      if (body.bring_list_enabled !== undefined) updates.set("bring_list_enabled", body.bring_list_enabled ? 1 : 0);
      if (body.bring_list_message !== undefined) updates.set("bring_list_message", optString(body.bring_list_message, "bring_list_message", 5000) ?? null);
      if (body.bring_list_mode !== undefined) updates.set("bring_list_mode", body.bring_list_mode === "signup" ? "signup" : "open");
      // A string sets or changes the password; null removes it. Either way the
      // hash changes, which invalidates every guest access token issued so far.
      if (body.password !== undefined) {
        const password = optPassword(body.password);
        updates.set("password_hash", password ? await hashPassword(password) : null);
      }

      // An end time is meaningless without a start time. Compare against the
      // post-update start time, which may be unchanged and still in the DB.
      const effectiveStart = updates.has("event_time") ? updates.get("event_time") : event.event_time;
      if (!effectiveStart) updates.set("event_end_time", null);

      if (updates.size > 0) {
        const fields = [...updates.keys()].map((key) => `${key} = ?`);
        await db.prepare(`UPDATE events SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`)
          .bind(...updates.values(), event.id).run();

        // Replacing or removing an uploaded banner should not leave the old R2
        // object behind, unless another event still uses it.
        if (updates.has("banner_url") && event.banner_url !== updates.get("banner_url")) {
          await deleteUploadIfUnreferenced(db, env.R2, event.banner_url, []);
        }
      }

      return json({ success: true });
    }

    // POST /api/admin/add-bring-item
    if (request.method === "POST" && path === "admin/add-bring-item") {
      const body = await readJson(request);
      const event = await requireAdmin<{ id: string; bring_list_mode: string }>(db, body, "id, bring_list_mode");
      const itemName = reqString(body.item_name, "item_name", 200);

      // Open mode: always store quantity=1 (no slot concept)
      const qty = event.bring_list_mode === "signup" ? clampedInt(body.quantity, "quantity", 1, MAX_SLOTS_PER_ITEM, 1) : 1;

      const id = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO bring_list_items (id, event_id, item_name, quantity) VALUES (?, ?, ?, ?)"
      ).bind(id, event.id, itemName, qty).run();

      const row = await db.prepare("SELECT * FROM bring_list_items WHERE id = ?").bind(id).first();
      return json(row);
    }

    // DELETE /api/admin/delete-bring-item
    if (request.method === "DELETE" && path === "admin/delete-bring-item") {
      const body = await readJson(request);
      const event = await requireAdmin(db, body);
      if (typeof body.item_id !== "string" || !body.item_id) return err("item_id is required");

      // Delete commitments then the item atomically (does not rely on FK cascade).
      await db.batch([
        db.prepare("DELETE FROM bring_commitments WHERE item_id = ? AND event_id = ?").bind(body.item_id, event.id),
        db.prepare("DELETE FROM bring_list_items WHERE id = ? AND event_id = ?").bind(body.item_id, event.id),
      ]);

      return json({ success: true });
    }

    // DELETE /api/admin/delete-rsvp
    if (request.method === "DELETE" && path === "admin/delete-rsvp") {
      const body = await readJson(request);
      const event = await requireAdmin(db, body);
      if (typeof body.rsvp_id !== "string" || !body.rsvp_id) return err("rsvp_id is required");

      // Delete the RSVP's commitments then the RSVP atomically.
      await db.batch([
        db.prepare("DELETE FROM bring_commitments WHERE rsvp_id = ? AND event_id = ?").bind(body.rsvp_id, event.id),
        db.prepare("DELETE FROM rsvps WHERE id = ? AND event_id = ?").bind(body.rsvp_id, event.id),
      ]);

      return json({ success: true });
    }

    // DELETE /api/admin/delete-event
    if (request.method === "DELETE" && path === "admin/delete-event") {
      const body = await readJson(request);
      const event = await requireAdmin<{ id: string; banner_url: string | null }>(db, body, "id, banner_url");

      // Delete all children then the event atomically (does not rely on FK cascade).
      await db.batch([
        db.prepare("DELETE FROM bring_commitments WHERE event_id = ?").bind(event.id),
        db.prepare("DELETE FROM bring_list_items WHERE event_id = ?").bind(event.id),
        db.prepare("DELETE FROM rsvps WHERE event_id = ?").bind(event.id),
        db.prepare("DELETE FROM events WHERE id = ?").bind(event.id),
      ]);
      // After the rows are gone, so a failed delete never leaves a live event
      // pointing at a missing banner.
      await deleteUploadIfUnreferenced(db, env.R2, event.banner_url, []);
      return json({ success: true });
    }

    // GET /api/rsvp/manage?event_id=...&rsvp_id=...&code=...
    if (request.method === "GET" && path === "rsvp/manage") {
      const event_id = url.searchParams.get("event_id");
      const rsvp_id = url.searchParams.get("rsvp_id");
      const code = url.searchParams.get("code");
      if (!event_id || !rsvp_id || !code) return err("event_id, rsvp_id, and code are required");

      const rsvp = await db.prepare(
        "SELECT id, guest_name, adults, kids, cancelled, manage_code, created_at FROM rsvps WHERE id = ? AND event_id = ? AND manage_code = ?"
      ).bind(rsvp_id, event_id, code).first();
      if (!rsvp) return err("RSVP not found or invalid code", 404);

      const normalizedRsvp = normalizeRsvp(rsvp);

      // Get commitments for this RSVP
      const { results: claimedItems } = await db.prepare(
        `SELECT bc.id, bc.item_id, bc.quantity, bc.note, bli.item_name
         FROM bring_commitments bc
         JOIN bring_list_items bli ON bc.item_id = bli.id
         WHERE bc.rsvp_id = ? AND bc.event_id = ?`
      ).bind(rsvp_id, event_id).all();

      return json({ rsvp: normalizedRsvp, claimed_items: claimedItems });
    }

    // PUT /api/rsvp/update
    if (request.method === "PUT" && path === "rsvp/update") {
      const body = await readJson(request);
      const { rsvp_id, manage_code } = body;
      if (typeof rsvp_id !== "string" || typeof manage_code !== "string" || !rsvp_id || !manage_code) {
        return err("rsvp_id and manage_code required");
      }

      // The manage code is the credential here, so the event password is not
      // asked for again.
      const rsvp = await db.prepare(
        "SELECT id, event_id, guest_name, cancelled FROM rsvps WHERE id = ? AND manage_code = ?"
      ).bind(rsvp_id, manage_code).first<{ id: string; event_id: string; guest_name: string; cancelled: number }>();
      if (!rsvp) return err("Invalid manage code", 403);

      const event = await db
        .prepare("SELECT id, password_hash, bring_list_enabled, bring_list_mode FROM events WHERE id = ?")
        .bind(rsvp.event_id)
        .first<GuestEvent>();
      if (!event) return err("Event not found", 404);

      // ---- Validate everything up front, mutate nothing until all checks pass. ----
      const newName = body.guest_name !== undefined ? reqString(body.guest_name, "guest_name", 100) : rsvp.guest_name;
      const cancelled = body.cancelled === undefined ? undefined : !!body.cancelled;
      const willBeCancelled = cancelled ?? rsvp.cancelled === 1;
      const unclaimIds = new Set(optList(body.unclaim_item_ids, "unclaim_item_ids", 200).filter((v): v is string => typeof v === "string"));

      const { results: myCommitments } = await db.prepare(
        "SELECT id, item_id, quantity FROM bring_commitments WHERE rsvp_id = ? AND event_id = ?"
      ).bind(rsvp.id, event.id).all<{ id: string; item_id: string; quantity: number }>();
      // A cancelled RSVP holds no claims, whatever the client asked for.
      const releasing = willBeCancelled ? myCommitments : myCommitments.filter((c) => unclaimIds.has(c.id));
      const released = new Map<string, number>();
      for (const c of releasing) released.set(c.item_id, (released.get(c.item_id) ?? 0) + c.quantity);

      const listOpen = event.bring_list_enabled === 1 && !willBeCancelled;
      const claims = listOpen ? await checkClaims(db, event, parseClaims(body.claim_items, event.bring_list_mode), released) : [];
      const customItems = listOpen ? parseCustomItems(body.custom_items, event.bring_list_mode) : [];

      // ---- Apply all mutations atomically. ----
      const statements: D1PreparedStatement[] = [];

      const fields: string[] = [];
      const values: unknown[] = [];
      if (body.guest_name !== undefined) { fields.push("guest_name = ?"); values.push(newName); }
      if (body.adults !== undefined) { fields.push("adults = ?"); values.push(clampedInt(body.adults, "adults", 1, 50, 1)); }
      if (body.kids !== undefined) { fields.push("kids = ?"); values.push(clampedInt(body.kids, "kids", 0, 50, 0)); }
      if (cancelled !== undefined) { fields.push("cancelled = ?"); values.push(cancelled ? 1 : 0); }
      if (fields.length > 0) {
        statements.push(db.prepare(`UPDATE rsvps SET ${fields.join(", ")} WHERE id = ?`).bind(...values, rsvp.id));
      }

      if (newName !== rsvp.guest_name) {
        statements.push(db.prepare(
          "UPDATE bring_commitments SET guest_name = ? WHERE rsvp_id = ? AND event_id = ?"
        ).bind(newName, rsvp.id, event.id));
      }

      for (const c of releasing) {
        statements.push(db.prepare(
          "DELETE FROM bring_commitments WHERE id = ? AND rsvp_id = ? AND event_id = ?"
        ).bind(c.id, rsvp.id, event.id));
      }

      const readReserved = appendBringStatements(db, statements, event, rsvp.id, newName, claims, customItems);
      const results = statements.length > 0 ? await db.batch(statements) : [];

      return json({ success: true, reserved: readReserved(results) });
    }

    return err("Not found", 404);
  } catch (e) {
    if (e instanceof HttpError) return err(e.message, e.status);
    // Log the detail server-side; return a generic message to avoid leaking internals.
    console.error("API error:", e);
    return err("Internal error", 500);
  }
};

function normalizeEvent(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    ...row,
    bring_list_enabled: Boolean(row.bring_list_enabled),
    bring_list_mode: (row.bring_list_mode as string) ?? "open",
  };
}

function normalizeRsvp(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    ...row,
    cancelled: Boolean(row.cancelled),
  };
}
