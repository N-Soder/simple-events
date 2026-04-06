import bcrypt from "bcryptjs";

interface Env {
  DB: D1Database;
  R2: R2Bucket;
  R2_PUBLIC_URL: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

async function eventRequiresPassword(db: D1Database, eventId: string): Promise<boolean | null> {
  const row = await db.prepare("SELECT password_hash FROM events WHERE id = ?").bind(eventId).first<{ password_hash: string | null }>();
  if (!row) return null;
  return row.password_hash !== null;
}

async function verifyEventPassword(db: D1Database, eventId: string, password?: string): Promise<boolean> {
  const requires = await eventRequiresPassword(db, eventId);
  if (requires === null) return false;
  if (!requires) return true;
  if (!password) return false;
  const row = await db.prepare("SELECT password_hash FROM events WHERE id = ?").bind(eventId).first<{ password_hash: string }>();
  if (!row?.password_hash) return false;
  return bcrypt.compareSync(password, row.password_hash);
}

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

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const db = env.DB;

  try {
    // POST /api/upload - Upload banner to R2
    if (request.method === "POST" && path === "upload") {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) return err("file is required");

      const ext = file.name.split(".").pop() ?? "bin";
      const key = `${crypto.randomUUID()}.${ext}`;
      await env.R2.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });
      const publicUrl = env.R2_PUBLIC_URL
        ? `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`
        : `/banners/${key}`;
      return json({ url: publicUrl });
    }

    // POST /api/create - Create a new event
    if (request.method === "POST" && path === "create") {
      const body = await request.json() as Record<string, unknown>;
      const { name, description, event_date, event_time, location, banner_url, password, guest_visibility, bring_items, bring_list_enabled, bring_list_message, bring_list_mode } = body as {
        name?: string; description?: string; event_date?: string; event_time?: string;
        location?: string; banner_url?: string; password?: string;
        guest_visibility?: string; bring_items?: Array<{ name: string; quantity: number } | string>;
        bring_list_enabled?: boolean; bring_list_message?: string;
        bring_list_mode?: string;
      };

      if (!name || !event_date) return err("name and event_date are required");
      if (name.length > 200) return err("name must be 200 characters or fewer");
      if (description && (description as string).length > 5000) return err("description must be 5000 characters or fewer");
      if (location && (location as string).length > 500) return err("location must be 500 characters or fewer");

      const id = crypto.randomUUID();
      const admin_token = crypto.randomUUID();
      const password_hash = password ? bcrypt.hashSync(password, 10) : null;
      const mode = bring_list_mode === "signup" ? "signup" : "open";

      await db.prepare(
        `INSERT INTO events (id, name, description, event_date, event_time, location, banner_url, password_hash, guest_visibility, admin_token, bring_list_enabled, bring_list_message, bring_list_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, name, description ?? null, event_date, event_time ?? null,
        location ?? null, banner_url ?? null, password_hash,
        guest_visibility ?? "full", admin_token,
        bring_list_enabled !== false ? 1 : 0,
        bring_list_message ?? null,
        mode
      ).run();

      // Insert one row per unique item with its target quantity
      // In open mode, quantity is always 1 (no concept of slots)
      if (Array.isArray(bring_items) && bring_items.length > 0) {
        const stmt = db.prepare("INSERT INTO bring_list_items (id, event_id, item_name, quantity) VALUES (?, ?, ?, ?)");
        await db.batch(bring_items.map((item) => {
          const rawName = typeof item === "string" ? item : item.name;
          const itemName = rawName?.trim().slice(0, 200) || "Item";
          const qty = mode === "open" ? 1 : (typeof item === "string" ? 1 : Math.min(Math.max(item.quantity || 1, 1), 20));
          return stmt.bind(crypto.randomUUID(), id, itemName, qty);
        }));
      }

      return json({ id, admin_token });
    }

    // POST /api/verify - Verify event password
    if (request.method === "POST" && path === "verify") {
      const { event_id, password } = await request.json() as { event_id?: string; password?: string };
      if (!event_id) return err("event_id is required");

      const requires = await eventRequiresPassword(db, event_id);
      if (requires === null) return err("Event not found", 404);
      if (!requires) return json({ valid: true });
      if (!password) return json({ valid: false });

      const row = await db.prepare("SELECT password_hash FROM events WHERE id = ?").bind(event_id).first<{ password_hash: string }>();
      const valid = row?.password_hash ? bcrypt.compareSync(password, row.password_hash) : false;
      return json({ valid });
    }

    // GET /api/event?id=...&password=... - Guest view
    if (request.method === "GET" && path === "event") {
      const event_id = url.searchParams.get("id");
      if (!event_id) return err("id is required");

      const password = url.searchParams.get("password") ?? undefined;
      const valid = await verifyEventPassword(db, event_id, password);
      if (!valid) return err("Invalid password", 403);

      const event = await db.prepare(
        "SELECT id, name, description, event_date, event_time, location, banner_url, guest_visibility, bring_list_enabled, bring_list_message, bring_list_mode, created_at FROM events WHERE id = ?"
      ).bind(event_id).first();
      if (!event) return err("Event not found", 404);

      const { results: rsvps } = await db.prepare(
        "SELECT id, guest_name, adults, kids, cancelled, created_at FROM rsvps WHERE event_id = ? ORDER BY created_at ASC"
      ).bind(event_id).all();

      const bringItems = await getBringItems(db, event_id);

      return json({ event: normalizeEvent(event), rsvps: rsvps.map(normalizeRsvp), bring_items: bringItems });
    }

    // GET /api/admin?id=...&token=... - Admin view
    if (request.method === "GET" && path === "admin") {
      const event_id = url.searchParams.get("id");
      const token = url.searchParams.get("token");
      if (!event_id || !token) return err("id and token are required");

      const event = await db.prepare(
        "SELECT id, name, description, event_date, event_time, location, banner_url, guest_visibility, bring_list_enabled, bring_list_message, bring_list_mode, admin_token, created_at FROM events WHERE id = ? AND admin_token = ?"
      ).bind(event_id, token).first();
      if (!event) return err("Invalid admin link", 403);

      const { results: rsvps } = await db.prepare(
        "SELECT id, guest_name, adults, kids, cancelled, manage_code, created_at FROM rsvps WHERE event_id = ? ORDER BY created_at ASC"
      ).bind(event_id).all();

      const bringItems = await getBringItems(db, event_id);

      return json({ event: normalizeEvent(event), rsvps: rsvps.map(normalizeRsvp), bring_items: bringItems });
    }

    // POST /api/rsvp - Submit RSVP
    if (request.method === "POST" && path === "rsvp") {
      const { event_id, password, guest_name, adults, kids, honeypot } = await request.json() as {
        event_id?: string; password?: string; guest_name?: string;
        adults?: number; kids?: number; honeypot?: string;
      };
      if (honeypot) return json({ success: true });
      if (!event_id || !guest_name) return err("event_id and guest_name are required");
      const safeName = (guest_name as string).trim();
      if (!safeName) return err("guest_name is required");
      if (safeName.length > 100) return err("guest_name must be 100 characters or fewer");

      const valid = await verifyEventPassword(db, event_id, password);
      if (!valid) return err("Invalid password", 403);

      const safeAdults = Math.min(Math.max(Math.floor(adults ?? 1), 1), 50);
      const safeKids = Math.min(Math.max(Math.floor(kids ?? 0), 0), 50);

      const id = crypto.randomUUID();
      const manage_code = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO rsvps (id, event_id, guest_name, adults, kids, manage_code) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(id, event_id, safeName, safeAdults, safeKids, manage_code).run();

      const row = await db.prepare("SELECT * FROM rsvps WHERE id = ?").bind(id).first();
      return json(normalizeRsvp(row));
    }

    // POST /api/claim-item - Commit to bringing an item
    if (request.method === "POST" && path === "claim-item") {
      const { event_id, password, item_id, rsvp_id, manage_code, quantity, note } = await request.json() as {
        event_id?: string; password?: string; item_id?: string;
        rsvp_id?: string; manage_code?: string; quantity?: number; note?: string;
      };
      if (!event_id || !item_id || !rsvp_id || !manage_code) {
        return err("event_id, item_id, rsvp_id, and manage_code are required");
      }

      const valid = await verifyEventPassword(db, event_id, password);
      if (!valid) return err("Invalid password", 403);

      // Verify RSVP ownership via manage_code
      const rsvp = await db.prepare(
        "SELECT id, guest_name FROM rsvps WHERE id = ? AND event_id = ? AND manage_code = ?"
      ).bind(rsvp_id, event_id, manage_code).first<{ id: string; guest_name: string }>();
      if (!rsvp) return err("Invalid RSVP or manage code", 403);

      // Verify item belongs to this event
      const item = await db.prepare(
        "SELECT id, quantity FROM bring_list_items WHERE id = ? AND event_id = ?"
      ).bind(item_id, event_id).first<{ id: string; quantity: number }>();
      if (!item) return err("Item not found", 404);

      // Fetch event mode
      const eventRow = await db.prepare("SELECT bring_list_mode FROM events WHERE id = ?").bind(event_id).first<{ bring_list_mode: string }>();
      const mode = eventRow?.bring_list_mode ?? "open";

      const qty = mode === "open" ? 1 : Math.min(Math.max(quantity ?? 1, 1), 20);

      // Enforce slot cap in signup mode
      if (mode === "signup") {
        const committedRow = await db.prepare(
          "SELECT COALESCE(SUM(quantity), 0) as total FROM bring_commitments WHERE item_id = ? AND event_id = ?"
        ).bind(item_id, event_id).first<{ total: number }>();
        const committed = committedRow?.total ?? 0;
        if (committed + qty > item.quantity) {
          return err("This slot is full", 409);
        }
      }

      const sanitizedNote = note ? note.trim().slice(0, 150) || null : null;
      const commitmentId = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO bring_commitments (id, item_id, event_id, rsvp_id, guest_name, quantity, note) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(commitmentId, item_id, event_id, rsvp_id, rsvp.guest_name, qty, sanitizedNote).run();

      const row = await db.prepare("SELECT * FROM bring_commitments WHERE id = ?").bind(commitmentId).first();
      return json(row);
    }

    // POST /api/add-item - Add a custom bring list item (guest-suggested)
    if (request.method === "POST" && path === "add-item") {
      const { event_id, password, item_name, rsvp_id, manage_code, note } = await request.json() as {
        event_id?: string; password?: string; item_name?: string;
        rsvp_id?: string; manage_code?: string; note?: string;
      };
      if (!event_id || !item_name) return err("event_id and item_name are required");
      const safeItemName = (item_name as string).trim();
      if (!safeItemName) return err("item_name is required");
      if (safeItemName.length > 200) return err("item_name must be 200 characters or fewer");

      const valid = await verifyEventPassword(db, event_id, password);
      if (!valid) return err("Invalid password", 403);

      // Block custom items in signup mode
      const eventRow = await db.prepare("SELECT bring_list_mode FROM events WHERE id = ?").bind(event_id).first<{ bring_list_mode: string }>();
      const mode = eventRow?.bring_list_mode ?? "open";
      if (mode === "signup") {
        return err("Custom items are not allowed in Sign-up Sheet mode", 403);
      }

      const itemId = crypto.randomUUID();
      // Open mode: quantity is always 1 (no slot concept)
      await db.prepare(
        "INSERT INTO bring_list_items (id, event_id, item_name, quantity) VALUES (?, ?, ?, ?)"
      ).bind(itemId, event_id, safeItemName, 1).run();

      // If we have RSVP ownership, create a commitment immediately
      if (rsvp_id && manage_code) {
        const rsvp = await db.prepare(
          "SELECT id, guest_name FROM rsvps WHERE id = ? AND event_id = ? AND manage_code = ?"
        ).bind(rsvp_id, event_id, manage_code).first<{ id: string; guest_name: string }>();
        if (rsvp) {
          const sanitizedNote = note ? note.trim().slice(0, 150) || null : null;
          await db.prepare(
            "INSERT INTO bring_commitments (id, item_id, event_id, rsvp_id, guest_name, quantity, note) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(crypto.randomUUID(), itemId, event_id, rsvp_id, rsvp.guest_name, 1, sanitizedNote).run();
        }
      }

      const row = await db.prepare("SELECT * FROM bring_list_items WHERE id = ?").bind(itemId).first();
      return json(row);
    }

    // PUT /api/admin/update - Update event (admin)
    if (request.method === "PUT" && path === "admin/update") {
      const { event_id, admin_token, ...updates } = await request.json() as Record<string, unknown>;
      if (!event_id || !admin_token) return err("event_id and admin_token required");

      const event = await db.prepare("SELECT id FROM events WHERE id = ? AND admin_token = ?").bind(event_id, admin_token).first();
      if (!event) return err("Invalid admin token", 403);

      const allowed = ["name", "description", "event_date", "event_time", "location", "banner_url", "guest_visibility", "bring_list_enabled", "bring_list_message", "bring_list_mode"];
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const key of allowed) {
        if (updates[key] !== undefined) {
          fields.push(`${key} = ?`);
          if (key === "bring_list_enabled") {
            values.push(updates[key] ? 1 : 0);
          } else if (key === "bring_list_mode") {
            values.push(updates[key] === "signup" ? "signup" : "open");
          } else {
            values.push(updates[key]);
          }
        }
      }

      if (fields.length > 0) {
        values.push(event_id);
        await db.prepare(`UPDATE events SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`).bind(...values).run();
      }

      return json({ success: true });
    }

    // POST /api/admin/add-bring-item
    if (request.method === "POST" && path === "admin/add-bring-item") {
      const { event_id, admin_token, item_name, quantity } = await request.json() as {
        event_id?: string; admin_token?: string; item_name?: string; quantity?: number;
      };
      if (!event_id || !admin_token || !item_name) return err("All fields required");
      const safeAdminItemName = (item_name as string).trim();
      if (!safeAdminItemName) return err("item_name is required");
      if (safeAdminItemName.length > 200) return err("item_name must be 200 characters or fewer");

      const event = await db.prepare("SELECT id, bring_list_mode FROM events WHERE id = ? AND admin_token = ?").bind(event_id, admin_token).first<{ id: string; bring_list_mode: string }>();
      if (!event) return err("Invalid admin token", 403);

      // Open mode: always store quantity=1 (no slot concept)
      const mode = event.bring_list_mode ?? "open";
      const qty = mode === "open" ? 1 : Math.min(Math.max(quantity ?? 1, 1), 20);

      const id = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO bring_list_items (id, event_id, item_name, quantity) VALUES (?, ?, ?, ?)"
      ).bind(id, event_id, safeAdminItemName, qty).run();

      const row = await db.prepare("SELECT * FROM bring_list_items WHERE id = ?").bind(id).first();
      return json(row);
    }

    // DELETE /api/admin/delete-bring-item
    if (request.method === "DELETE" && path === "admin/delete-bring-item") {
      const { event_id, admin_token, item_id } = await request.json() as {
        event_id?: string; admin_token?: string; item_id?: string;
      };
      if (!event_id || !admin_token || !item_id) return err("All fields required");

      const event = await db.prepare("SELECT id FROM events WHERE id = ? AND admin_token = ?").bind(event_id, admin_token).first();
      if (!event) return err("Invalid admin token", 403);

      const { success } = await db.prepare(
        "DELETE FROM bring_list_items WHERE id = ? AND event_id = ?"
      ).bind(item_id, event_id).run();
      if (!success) return err("Delete failed", 500);

      return json({ success: true });
    }

    // DELETE /api/admin/delete-rsvp
    if (request.method === "DELETE" && path === "admin/delete-rsvp") {
      const { event_id, admin_token, rsvp_id } = await request.json() as {
        event_id?: string; admin_token?: string; rsvp_id?: string;
      };
      if (!event_id || !admin_token || !rsvp_id) return err("All fields required");

      const event = await db.prepare("SELECT id FROM events WHERE id = ? AND admin_token = ?").bind(event_id, admin_token).first();
      if (!event) return err("Invalid admin token", 403);

      const { success } = await db.prepare(
        "DELETE FROM rsvps WHERE id = ? AND event_id = ?"
      ).bind(rsvp_id, event_id).run();
      if (!success) return err("Delete failed", 500);

      return json({ success: true });
    }

    // DELETE /api/admin/delete-event
    if (request.method === "DELETE" && path === "admin/delete-event") {
      const { event_id, admin_token } = await request.json() as {
        event_id?: string; admin_token?: string;
      };
      if (!event_id || !admin_token) return err("event_id and admin_token required");

      const event = await db
        .prepare("SELECT id, banner_url FROM events WHERE id = ? AND admin_token = ?")
        .bind(event_id, admin_token)
        .first<{ id: string; banner_url: string | null }>();
      if (!event) return err("Invalid admin token", 403);

      if (event.banner_url) {
        const r2Key = event.banner_url.split("/").pop();
        if (r2Key) {
          try { await env.R2.delete(r2Key); } catch { /* R2 cleanup is best-effort */ }
        }
      }

      await db.prepare("DELETE FROM events WHERE id = ?").bind(event_id).run();
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
      const { rsvp_id, manage_code, guest_name, adults, kids, unclaim_item_ids, claim_items, custom_items, event_id, cancelled } = await request.json() as {
        rsvp_id?: string; manage_code?: string; guest_name?: string; adults?: number; kids?: number;
        unclaim_item_ids?: string[];
        claim_items?: Array<{ item_id: string; quantity: number; note?: string }>;
        custom_items?: Array<{ item_name: string; quantity: number; note?: string }>;
        event_id?: string; cancelled?: boolean;
      };
      if (!rsvp_id || !manage_code) return err("rsvp_id and manage_code required");

      const rsvp = await db.prepare(
        "SELECT id, event_id, guest_name FROM rsvps WHERE id = ? AND manage_code = ?"
      ).bind(rsvp_id, manage_code).first<{ id: string; event_id: string; guest_name: string }>();
      if (!rsvp) return err("Invalid manage code", 403);

      const oldName = rsvp.guest_name;

      // Fetch event mode
      const eventRow = await db.prepare("SELECT bring_list_mode FROM events WHERE id = ?").bind(rsvp.event_id).first<{ bring_list_mode: string }>();
      const mode = eventRow?.bring_list_mode ?? "open";

      // Block custom items in signup mode
      if (mode === "signup" && Array.isArray(custom_items) && custom_items.length > 0) {
        return err("Custom items are not allowed in Sign-up Sheet mode", 403);
      }

      // Validate updated fields
      let sanitizedGuestName: string | undefined;
      if (guest_name !== undefined) {
        sanitizedGuestName = (guest_name as string).trim();
        if (!sanitizedGuestName) return err("guest_name is required");
        if (sanitizedGuestName.length > 100) return err("guest_name must be 100 characters or fewer");
      }

      // Update RSVP fields
      const fields: string[] = [];
      const values: unknown[] = [];
      if (sanitizedGuestName !== undefined) { fields.push("guest_name = ?"); values.push(sanitizedGuestName); }
      if (adults !== undefined) { fields.push("adults = ?"); values.push(Math.min(Math.max(Math.floor(adults), 1), 50)); }
      if (kids !== undefined) { fields.push("kids = ?"); values.push(Math.min(Math.max(Math.floor(kids), 0), 50)); }
      if (cancelled !== undefined) { fields.push("cancelled = ?"); values.push(cancelled ? 1 : 0); }

      if (fields.length > 0) {
        values.push(rsvp_id);
        await db.prepare(`UPDATE rsvps SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
      }

      // Keep commitment guest_name in sync if name changed
      const newName = sanitizedGuestName ?? oldName;
      if (sanitizedGuestName && sanitizedGuestName !== oldName) {
        await db.prepare(
          "UPDATE bring_commitments SET guest_name = ? WHERE rsvp_id = ? AND event_id = ?"
        ).bind(newName, rsvp_id, rsvp.event_id).run();
      }

      // Remove commitments by commitment ID (ownership enforced by rsvp_id)
      // Run unclaims FIRST so signup cap checks below see accurate remaining counts
      if (Array.isArray(unclaim_item_ids) && unclaim_item_ids.length > 0) {
        for (const commitmentId of unclaim_item_ids) {
          await db.prepare(
            "DELETE FROM bring_commitments WHERE id = ? AND rsvp_id = ? AND event_id = ?"
          ).bind(commitmentId, rsvp_id, rsvp.event_id).run();
        }
      }

      // Add new commitments
      if (Array.isArray(claim_items) && claim_items.length > 0) {
        for (const { item_id, quantity, note } of claim_items) {
          const item = await db.prepare(
            "SELECT id, quantity FROM bring_list_items WHERE id = ? AND event_id = ?"
          ).bind(item_id, rsvp.event_id).first<{ id: string; quantity: number }>();
          if (!item) continue;

          const qty = mode === "open" ? 1 : Math.min(Math.max(quantity ?? 1, 1), 20);

          // Enforce slot cap in signup mode (after unclaims have been processed)
          if (mode === "signup") {
            const committedRow = await db.prepare(
              "SELECT COALESCE(SUM(quantity), 0) as total FROM bring_commitments WHERE item_id = ? AND event_id = ?"
            ).bind(item_id, rsvp.event_id).first<{ total: number }>();
            const committed = committedRow?.total ?? 0;
            if (committed + qty > item.quantity) {
              return err("This slot is full", 409);
            }
          }

          const sanitizedNote = note ? note.trim().slice(0, 150) || null : null;
          await db.prepare(
            "INSERT INTO bring_commitments (id, item_id, event_id, rsvp_id, guest_name, quantity, note) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(crypto.randomUUID(), item_id, rsvp.event_id, rsvp_id, newName, qty, sanitizedNote).run();
        }
      }

      // Add custom items (new bring_list_items row + commitment) — open mode only
      if (Array.isArray(custom_items) && custom_items.length > 0) {
        for (const { item_name, note } of custom_items) {
          const safeCustomItemName = (item_name as string)?.trim().slice(0, 200);
          if (!safeCustomItemName) continue;
          const itemId = crypto.randomUUID();
          await db.prepare(
            "INSERT INTO bring_list_items (id, event_id, item_name, quantity) VALUES (?, ?, ?, ?)"
          ).bind(itemId, rsvp.event_id, safeCustomItemName, 1).run();
          const sanitizedNote = note ? note.trim().slice(0, 150) || null : null;
          await db.prepare(
            "INSERT INTO bring_commitments (id, item_id, event_id, rsvp_id, guest_name, quantity, note) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(crypto.randomUUID(), itemId, rsvp.event_id, rsvp_id, newName, 1, sanitizedNote).run();
        }
      }

      return json({ success: true });
    }

    return err("Not found", 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    return err(message, 500);
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
