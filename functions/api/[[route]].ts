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

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  // Strip leading /api/ prefix to get the route path
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
      const { name, description, event_date, event_time, location, banner_url, password, guest_visibility, bring_items, bring_list_enabled, bring_list_message } = body as {
        name?: string; description?: string; event_date?: string; event_time?: string;
        location?: string; banner_url?: string; password?: string;
        guest_visibility?: string; bring_items?: Array<{ name: string; quantity: number } | string>;
        bring_list_enabled?: boolean; bring_list_message?: string;
      };

      if (!name || !event_date) return err("name and event_date are required");

      const id = crypto.randomUUID();
      const admin_token = crypto.randomUUID();
      const password_hash = password ? bcrypt.hashSync(password, 10) : null;

      await db.prepare(
        `INSERT INTO events (id, name, description, event_date, event_time, location, banner_url, password_hash, guest_visibility, admin_token, bring_list_enabled, bring_list_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, name, description ?? null, event_date, event_time ?? null,
        location ?? null, banner_url ?? null, password_hash,
        guest_visibility ?? "full", admin_token,
        bring_list_enabled !== false ? 1 : 0,
        bring_list_message ?? null
      ).run();

      if (Array.isArray(bring_items) && bring_items.length > 0) {
        const rows: { event_id: string; item_name: string }[] = [];
        for (const item of bring_items) {
          const itemName = typeof item === "string" ? item : item.name;
          const qty = typeof item === "string" ? 1 : Math.min(Math.max(item.quantity || 1, 1), 20);
          for (let i = 0; i < qty; i++) {
            rows.push({ event_id: id, item_name: itemName });
          }
        }
        const stmt = db.prepare("INSERT INTO bring_list_items (id, event_id, item_name) VALUES (?, ?, ?)");
        await db.batch(rows.map(r => stmt.bind(crypto.randomUUID(), r.event_id, r.item_name)));
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
        "SELECT id, name, description, event_date, event_time, location, banner_url, guest_visibility, bring_list_enabled, bring_list_message, created_at FROM events WHERE id = ?"
      ).bind(event_id).first();
      if (!event) return err("Event not found", 404);

      const { results: rsvps } = await db.prepare(
        "SELECT id, guest_name, adults, kids, cancelled, created_at FROM rsvps WHERE event_id = ? ORDER BY created_at ASC"
      ).bind(event_id).all();

      const { results: bringItems } = await db.prepare(
        "SELECT id, item_name, claimed_by, created_at FROM bring_list_items WHERE event_id = ? ORDER BY created_at ASC"
      ).bind(event_id).all();

      return json({ event: normalizeEvent(event), rsvps: rsvps.map(normalizeRsvp), bring_items: bringItems });
    }

    // GET /api/admin?id=...&token=... - Admin view
    if (request.method === "GET" && path === "admin") {
      const event_id = url.searchParams.get("id");
      const token = url.searchParams.get("token");
      if (!event_id || !token) return err("id and token are required");

      const event = await db.prepare(
        "SELECT id, name, description, event_date, event_time, location, banner_url, guest_visibility, bring_list_enabled, bring_list_message, admin_token, created_at FROM events WHERE id = ? AND admin_token = ?"
      ).bind(event_id, token).first();
      if (!event) return err("Invalid admin link", 403);

      const { results: rsvps } = await db.prepare(
        "SELECT id, guest_name, adults, kids, cancelled, created_at FROM rsvps WHERE event_id = ? ORDER BY created_at ASC"
      ).bind(event_id).all();

      const { results: bringItems } = await db.prepare(
        "SELECT id, item_name, claimed_by, created_at FROM bring_list_items WHERE event_id = ? ORDER BY created_at ASC"
      ).bind(event_id).all();

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

      const valid = await verifyEventPassword(db, event_id, password);
      if (!valid) return err("Invalid password", 403);

      const id = crypto.randomUUID();
      const manage_code = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO rsvps (id, event_id, guest_name, adults, kids, manage_code) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(id, event_id, guest_name, adults ?? 1, kids ?? 0, manage_code).run();

      const row = await db.prepare("SELECT * FROM rsvps WHERE id = ?").bind(id).first();
      return json(normalizeRsvp(row));
    }

    // POST /api/claim-item - Claim a bring list item
    if (request.method === "POST" && path === "claim-item") {
      const { event_id, password, item_id, claimed_by } = await request.json() as {
        event_id?: string; password?: string; item_id?: string; claimed_by?: string;
      };
      if (!event_id || !item_id || !claimed_by) return err("event_id, item_id, and claimed_by are required");

      const valid = await verifyEventPassword(db, event_id, password);
      if (!valid) return err("Invalid password", 403);

      await db.prepare(
        "UPDATE bring_list_items SET claimed_by = ? WHERE id = ? AND event_id = ?"
      ).bind(claimed_by, item_id, event_id).run();

      const row = await db.prepare("SELECT * FROM bring_list_items WHERE id = ?").bind(item_id).first();
      return json(row);
    }

    // POST /api/add-item - Add custom bring list item
    if (request.method === "POST" && path === "add-item") {
      const { event_id, password, item_name, claimed_by } = await request.json() as {
        event_id?: string; password?: string; item_name?: string; claimed_by?: string;
      };
      if (!event_id || !item_name) return err("event_id and item_name are required");

      const valid = await verifyEventPassword(db, event_id, password);
      if (!valid) return err("Invalid password", 403);

      const id = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO bring_list_items (id, event_id, item_name, claimed_by) VALUES (?, ?, ?, ?)"
      ).bind(id, event_id, item_name, claimed_by ?? null).run();

      const row = await db.prepare("SELECT * FROM bring_list_items WHERE id = ?").bind(id).first();
      return json(row);
    }

    // PUT /api/admin/update - Update event (admin)
    if (request.method === "PUT" && path === "admin/update") {
      const { event_id, admin_token, ...updates } = await request.json() as Record<string, unknown>;
      if (!event_id || !admin_token) return err("event_id and admin_token required");

      const event = await db.prepare("SELECT id FROM events WHERE id = ? AND admin_token = ?").bind(event_id, admin_token).first();
      if (!event) return err("Invalid admin token", 403);

      const allowed = ["name", "description", "event_date", "event_time", "location", "banner_url", "guest_visibility", "bring_list_enabled", "bring_list_message"];
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const key of allowed) {
        if (updates[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(key === "bring_list_enabled" ? (updates[key] ? 1 : 0) : updates[key]);
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

      const event = await db.prepare("SELECT id FROM events WHERE id = ? AND admin_token = ?").bind(event_id, admin_token).first();
      if (!event) return err("Invalid admin token", 403);

      const qty = Math.min(Math.max(quantity ?? 1, 1), 20);
      const stmt = db.prepare("INSERT INTO bring_list_items (id, event_id, item_name) VALUES (?, ?, ?)");
      const insertedIds: string[] = [];
      for (let i = 0; i < qty; i++) {
        const id = crypto.randomUUID();
        insertedIds.push(id);
        await stmt.bind(id, event_id, item_name).run();
      }

      const placeholders = insertedIds.map(() => "?").join(", ");
      const { results } = await db.prepare(`SELECT * FROM bring_list_items WHERE id IN (${placeholders})`).bind(...insertedIds).all();
      return json(results);
    }

    // DELETE /api/admin/delete-bring-item
    if (request.method === "DELETE" && path === "admin/delete-bring-item") {
      const { event_id, admin_token, item_id } = await request.json() as {
        event_id?: string; admin_token?: string; item_id?: string;
      };
      if (!event_id || !admin_token || !item_id) return err("All fields required");

      const event = await db.prepare("SELECT id FROM events WHERE id = ? AND admin_token = ?").bind(event_id, admin_token).first();
      if (!event) return err("Invalid admin token", 403);

      await db.prepare("DELETE FROM bring_list_items WHERE id = ? AND event_id = ?").bind(item_id, event_id).run();
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

      await db.prepare("DELETE FROM rsvps WHERE id = ? AND event_id = ?").bind(rsvp_id, event_id).run();
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
      const { results: claimedItems } = await db.prepare(
        "SELECT id, item_name FROM bring_list_items WHERE event_id = ? AND claimed_by = ?"
      ).bind(event_id, normalizedRsvp.guest_name).all();

      return json({ rsvp: normalizedRsvp, claimed_items: claimedItems });
    }

    // PUT /api/rsvp/update
    if (request.method === "PUT" && path === "rsvp/update") {
      const { rsvp_id, manage_code, guest_name, adults, kids, unclaim_item_ids, claim_item_ids, custom_items, event_id, cancelled } = await request.json() as {
        rsvp_id?: string; manage_code?: string; guest_name?: string; adults?: number; kids?: number;
        unclaim_item_ids?: string[]; claim_item_ids?: string[]; custom_items?: string[];
        event_id?: string; cancelled?: boolean;
      };
      if (!rsvp_id || !manage_code) return err("rsvp_id and manage_code required");

      const rsvp = await db.prepare(
        "SELECT id, event_id, guest_name FROM rsvps WHERE id = ? AND manage_code = ?"
      ).bind(rsvp_id, manage_code).first<{ id: string; event_id: string; guest_name: string }>();
      if (!rsvp) return err("Invalid manage code", 403);

      const oldName = rsvp.guest_name;
      const newName = guest_name ?? oldName;

      const fields: string[] = [];
      const values: unknown[] = [];
      if (guest_name !== undefined) { fields.push("guest_name = ?"); values.push(guest_name); }
      if (adults !== undefined) { fields.push("adults = ?"); values.push(adults); }
      if (kids !== undefined) { fields.push("kids = ?"); values.push(kids); }
      if (cancelled !== undefined) { fields.push("cancelled = ?"); values.push(cancelled ? 1 : 0); }

      if (fields.length > 0) {
        values.push(rsvp_id);
        await db.prepare(`UPDATE rsvps SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
      }

      if (guest_name && guest_name !== oldName) {
        await db.prepare("UPDATE bring_list_items SET claimed_by = ? WHERE event_id = ? AND claimed_by = ?").bind(newName, rsvp.event_id, oldName).run();
      }

      if (Array.isArray(unclaim_item_ids)) {
        for (const itemId of unclaim_item_ids) {
          await db.prepare("UPDATE bring_list_items SET claimed_by = NULL WHERE id = ? AND event_id = ?").bind(itemId, rsvp.event_id).run();
        }
      }

      if (Array.isArray(claim_item_ids)) {
        for (const itemId of claim_item_ids) {
          await db.prepare("UPDATE bring_list_items SET claimed_by = ? WHERE id = ? AND event_id = ? AND claimed_by IS NULL").bind(newName, itemId, rsvp.event_id).run();
        }
      }

      if (Array.isArray(custom_items)) {
        for (const itemName of custom_items) {
          await db.prepare("INSERT INTO bring_list_items (id, event_id, item_name, claimed_by) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), rsvp.event_id, itemName, newName).run();
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

// Normalize D1 row: convert INTEGER booleans to actual booleans
function normalizeEvent(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    ...row,
    bring_list_enabled: Boolean(row.bring_list_enabled),
  };
}

function normalizeRsvp(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    ...row,
    cancelled: Boolean(row.cancelled),
  };
}
