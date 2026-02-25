import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function error(msg: string, status = 400) {
  return json({ error: msg }, status);
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/** Check if an event requires a password. Returns true if password_hash is set. */
async function eventRequiresPassword(supabase: ReturnType<typeof getServiceClient>, eventId: string): Promise<boolean | null> {
  const { data } = await supabase
    .from("events")
    .select("password_hash")
    .eq("id", eventId)
    .single();
  if (!data) return null; // event not found
  return data.password_hash !== null;
}

/** Verify password for an event. Skips check if event has no password. Returns true if valid. */
async function verifyEventPassword(supabase: ReturnType<typeof getServiceClient>, eventId: string, password?: string): Promise<boolean> {
  const requires = await eventRequiresPassword(supabase, eventId);
  if (requires === null) return false; // event not found
  if (!requires) return true; // no password needed
  if (!password) return false; // password needed but not provided
  const { data } = await supabase.rpc("__verify_event_password", { event_uuid: eventId, pw: password });
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const pathname = url.pathname;

  const path = pathname
    .replace(/^\/functions\/v1\/event-api\/?/, "")
    .replace(/^\/event-api\/?/, "");

  if (path === "" || path === "/") {
    return json({ ok: true, endpoints: ["POST /create"] });
}

  const supabase = getServiceClient();

  try {
    // POST /create - Create a new event
    if (req.method === "POST" && path === "create") {
      const body = await req.json();
      const { name, description, event_date, event_time, location, banner_url, password, guest_visibility, bring_items, bring_list_enabled, bring_list_message } = body;

      if (!name || !event_date) {
        return error("name and event_date are required");
      }

      const hasPassword = !!password;

      const { data: eventRows, error: insertErr } = await supabase
        .from("events")
        .insert({
          name,
          description: description || null,
          event_date,
          event_time: event_time || null,
          location: location || null,
          banner_url: banner_url || null,
          password_hash: hasPassword ? "placeholder" : null,
          guest_visibility: guest_visibility || "full",
          bring_list_enabled: bring_list_enabled !== undefined ? bring_list_enabled : true,
          bring_list_message: bring_list_message || null,
        })
        .select("id, admin_token")
        .single();

      if (insertErr) return error(insertErr.message, 500);

      // Update password hash using pgcrypto (only if password provided)
      if (hasPassword) {
        const { error: hashErr } = await supabase.rpc("__update_event_password", {
          event_uuid: eventRows.id,
          pw: password,
        });
        if (hashErr) return error(hashErr.message, 500);
      }

      // Add bring list items
      if (bring_items && Array.isArray(bring_items) && bring_items.length > 0) {
        const rows: { event_id: string; item_name: string }[] = [];
        for (const item of bring_items) {
          const itemName = typeof item === "string" ? item : item.name;
          const qty = typeof item === "string" ? 1 : Math.min(Math.max(item.quantity || 1, 1), 20);
          for (let i = 0; i < qty; i++) {
            rows.push({ event_id: eventRows.id, item_name: itemName });
          }
        }
        if (rows.length > 0) await supabase.from("bring_list_items").insert(rows);
      }

      return json({ id: eventRows.id, admin_token: eventRows.admin_token });
    }

    // POST /verify - Verify event password
    if (req.method === "POST" && path === "verify") {
      const { event_id, password } = await req.json();
      if (!event_id) return error("event_id is required");

      const requires = await eventRequiresPassword(supabase, event_id);
      if (requires === null) return error("Event not found", 404);
      if (!requires) return json({ valid: true });

      if (!password) return json({ valid: false });
      const { data, error: err } = await supabase.rpc("__verify_event_password", {
        event_uuid: event_id,
        pw: password,
      });
      if (err) return error(err.message, 500);
      return json({ valid: data === true });
    }

    // GET /event?id=...&password=... - Get event data (guest view)
    if (req.method === "GET" && path === "event") {
      const event_id = url.searchParams.get("id");
      if (!event_id) return error("id is required");

      const password = url.searchParams.get("password") || undefined;
      const valid = await verifyEventPassword(supabase, event_id, password);
      if (!valid) return error("Invalid password", 403);

      const { data: event } = await supabase
        .from("events")
        .select("id, name, description, event_date, event_time, location, banner_url, guest_visibility, bring_list_enabled, bring_list_message, created_at")
        .eq("id", event_id)
        .single();

      if (!event) return error("Event not found", 404);

      const { data: rsvps } = await supabase
        .from("rsvps")
        .select("id, guest_name, adults, kids, created_at")
        .eq("event_id", event_id)
        .order("created_at", { ascending: true });

      const { data: bringItems } = await supabase
        .from("bring_list_items")
        .select("id, item_name, claimed_by, created_at")
        .eq("event_id", event_id)
        .order("created_at", { ascending: true });

      return json({ event, rsvps: rsvps || [], bring_items: bringItems || [] });
    }

    // GET /admin?id=...&token=... - Get event data (admin view)
    if (req.method === "GET" && path === "admin") {
      const event_id = url.searchParams.get("id");
      const token = url.searchParams.get("token");
      if (!event_id || !token) return error("id and token are required");

      const { data: event } = await supabase
        .from("events")
        .select("id, name, description, event_date, event_time, location, banner_url, guest_visibility, bring_list_enabled, bring_list_message, admin_token, created_at")
        .eq("id", event_id)
        .eq("admin_token", token)
        .single();

      if (!event) return error("Invalid admin link", 403);

      const { data: rsvps } = await supabase
        .from("rsvps")
        .select("id, guest_name, adults, kids, created_at")
        .eq("event_id", event_id)
        .order("created_at", { ascending: true });

      const { data: bringItems } = await supabase
        .from("bring_list_items")
        .select("id, item_name, claimed_by, created_at")
        .eq("event_id", event_id)
        .order("created_at", { ascending: true });

      return json({ event, rsvps: rsvps || [], bring_items: bringItems || [] });
    }

    // POST /rsvp - Add RSVP
    if (req.method === "POST" && path === "rsvp") {
      const { event_id, password, guest_name, adults, kids, honeypot } = await req.json();
      if (honeypot) return json({ success: true });
      if (!event_id || !guest_name) return error("event_id and guest_name are required");

      const valid = await verifyEventPassword(supabase, event_id, password);
      if (!valid) return error("Invalid password", 403);

      const { data, error: err } = await supabase
        .from("rsvps")
        .insert({ event_id, guest_name, adults: adults || 1, kids: kids || 0 })
        .select()
        .single();

      if (err) return error(err.message, 500);
      return json(data);
    }

    // POST /claim-item - Claim a bring list item
    if (req.method === "POST" && path === "claim-item") {
      const { event_id, password, item_id, claimed_by } = await req.json();
      if (!event_id || !item_id || !claimed_by) return error("event_id, item_id, and claimed_by are required");

      const valid = await verifyEventPassword(supabase, event_id, password);
      if (!valid) return error("Invalid password", 403);

      const { data, error: err } = await supabase
        .from("bring_list_items")
        .update({ claimed_by })
        .eq("id", item_id)
        .eq("event_id", event_id)
        .select()
        .single();

      if (err) return error(err.message, 500);
      return json(data);
    }

    // POST /add-item - Add custom bring list item
    if (req.method === "POST" && path === "add-item") {
      const { event_id, password, item_name, claimed_by } = await req.json();
      if (!event_id || !item_name) return error("event_id and item_name are required");

      const valid = await verifyEventPassword(supabase, event_id, password);
      if (!valid) return error("Invalid password", 403);

      const { data, error: err } = await supabase
        .from("bring_list_items")
        .insert({ event_id, item_name, claimed_by: claimed_by || null })
        .select()
        .single();

      if (err) return error(err.message, 500);
      return json(data);
    }

    // PUT /admin/update - Update event (admin)
    if (req.method === "PUT" && path === "admin/update") {
      const { event_id, admin_token, ...updates } = await req.json();
      if (!event_id || !admin_token) return error("event_id and admin_token required");

      const { data: event } = await supabase
        .from("events")
        .select("id")
        .eq("id", event_id)
        .eq("admin_token", admin_token)
        .single();

      if (!event) return error("Invalid admin token", 403);

      const allowed: Record<string, unknown> = {};
      for (const key of ["name", "description", "event_date", "event_time", "location", "banner_url", "guest_visibility", "bring_list_enabled", "bring_list_message"]) {
        if (updates[key] !== undefined) allowed[key] = updates[key];
      }

      if (Object.keys(allowed).length > 0) {
        const { error: err } = await supabase.from("events").update(allowed).eq("id", event_id);
        if (err) return error(err.message, 500);
      }

      return json({ success: true });
    }

    // POST /admin/add-bring-item
    if (req.method === "POST" && path === "admin/add-bring-item") {
      const { event_id, admin_token, item_name, quantity } = await req.json();
      if (!event_id || !admin_token || !item_name) return error("All fields required");

      const { data: event } = await supabase.from("events").select("id").eq("id", event_id).eq("admin_token", admin_token).single();
      if (!event) return error("Invalid admin token", 403);

      const qty = Math.min(Math.max(quantity || 1, 1), 20);
      const rows = Array.from({ length: qty }, () => ({ event_id, item_name }));
      const { data, error: err } = await supabase.from("bring_list_items").insert(rows).select();
      if (err) return error(err.message, 500);
      return json(data);
    }

    // DELETE /admin/delete-bring-item
    if (req.method === "DELETE" && path === "admin/delete-bring-item") {
      const { event_id, admin_token, item_id } = await req.json();
      if (!event_id || !admin_token || !item_id) return error("All fields required");

      const { data: event } = await supabase.from("events").select("id").eq("id", event_id).eq("admin_token", admin_token).single();
      if (!event) return error("Invalid admin token", 403);

      await supabase.from("bring_list_items").delete().eq("id", item_id).eq("event_id", event_id);
      return json({ success: true });
    }

    // DELETE /admin/delete-rsvp
    if (req.method === "DELETE" && path === "admin/delete-rsvp") {
      const { event_id, admin_token, rsvp_id } = await req.json();
      if (!event_id || !admin_token || !rsvp_id) return error("All fields required");

      const { data: event } = await supabase.from("events").select("id").eq("id", event_id).eq("admin_token", admin_token).single();
      if (!event) return error("Invalid admin token", 403);

      await supabase.from("rsvps").delete().eq("id", rsvp_id).eq("event_id", event_id);
      return json({ success: true });
    }

    // GET /rsvp/manage?event_id=...&rsvp_id=...&code=... - Fetch RSVP by manage code
    if (req.method === "GET" && path === "rsvp/manage") {
      const event_id = url.searchParams.get("event_id");
      const rsvp_id = url.searchParams.get("rsvp_id");
      const code = url.searchParams.get("code");
      if (!event_id || !rsvp_id || !code) return error("event_id, rsvp_id, and code are required");

      const { data: rsvp } = await supabase
        .from("rsvps")
        .select("id, guest_name, adults, kids, manage_code, created_at")
        .eq("id", rsvp_id)
        .eq("event_id", event_id)
        .eq("manage_code", code)
        .maybeSingle();

      if (!rsvp) return error("RSVP not found or invalid code", 404);

      const { data: claimedItems } = await supabase
        .from("bring_list_items")
        .select("id, item_name")
        .eq("event_id", event_id)
        .eq("claimed_by", rsvp.guest_name);

      return json({ rsvp, claimed_items: claimedItems || [] });
    }

    // PUT /rsvp/update - Update an existing RSVP via manage code
    if (req.method === "PUT" && path === "rsvp/update") {
      const { rsvp_id, manage_code, guest_name, adults, kids, unclaim_item_ids, claim_item_ids, custom_items, event_id } = await req.json();
      if (!rsvp_id || !manage_code) return error("rsvp_id and manage_code required");

      const { data: rsvp } = await supabase
        .from("rsvps")
        .select("id, event_id, guest_name")
        .eq("id", rsvp_id)
        .eq("manage_code", manage_code)
        .maybeSingle();

      if (!rsvp) return error("Invalid manage code", 403);

      const oldName = rsvp.guest_name;
      const newName = guest_name || oldName;

      // Update RSVP fields
      const updates: Record<string, unknown> = {};
      if (guest_name !== undefined) updates.guest_name = guest_name;
      if (adults !== undefined) updates.adults = adults;
      if (kids !== undefined) updates.kids = kids;

      if (Object.keys(updates).length > 0) {
        const { error: err } = await supabase.from("rsvps").update(updates).eq("id", rsvp_id);
        if (err) return error(err.message, 500);
      }

      // If name changed, update claimed_by on bring list items
      if (guest_name && guest_name !== oldName) {
        await supabase.from("bring_list_items").update({ claimed_by: guest_name }).eq("event_id", rsvp.event_id).eq("claimed_by", oldName);
      }

      // Unclaim items
      if (unclaim_item_ids && Array.isArray(unclaim_item_ids)) {
        for (const itemId of unclaim_item_ids) {
          await supabase.from("bring_list_items").update({ claimed_by: null }).eq("id", itemId).eq("event_id", rsvp.event_id);
        }
      }

      // Claim new items
      if (claim_item_ids && Array.isArray(claim_item_ids)) {
        for (const itemId of claim_item_ids) {
          await supabase.from("bring_list_items").update({ claimed_by: newName }).eq("id", itemId).eq("event_id", rsvp.event_id).is("claimed_by", null);
        }
      }

      // Add custom items
      if (custom_items && Array.isArray(custom_items)) {
        for (const itemName of custom_items) {
          await supabase.from("bring_list_items").insert({ event_id: rsvp.event_id, item_name: itemName, claimed_by: newName });
        }
      }

      return json({ success: true });
    }

    return error("Not found", 404);
  } catch (e) {
    return error(e.message || "Internal error", 500);
  }
});
