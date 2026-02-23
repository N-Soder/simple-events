import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/event-api\/?/, "");
  const supabase = getServiceClient();

  try {
    // POST /create - Create a new event
    if (req.method === "POST" && path === "create") {
      const body = await req.json();
      const { name, description, event_date, event_time, location, banner_url, password, guest_visibility, bring_items, bring_list_enabled } = body;

      if (!name || !event_date || !password) {
        return error("name, event_date, and password are required");
      }

      // Hash the password
      const { data: hashResult } = await supabase.rpc("__hash_password", { pw: password }).maybeSingle();
      // Fallback: use raw SQL
      const { data: eventRows, error: insertErr } = await supabase
        .from("events")
        .insert({
          name,
          description: description || null,
          event_date,
          event_time: event_time || null,
          location: location || null,
          banner_url: banner_url || null,
          password_hash: "placeholder",
          guest_visibility: guest_visibility || "full",
          bring_list_enabled: bring_list_enabled !== undefined ? bring_list_enabled : true,
        })
        .select("id, admin_token")
        .single();

      if (insertErr) return error(insertErr.message, 500);

      // Update password hash using raw SQL (pgcrypto)
      const { error: hashErr } = await supabase.rpc("__update_event_password", {
        event_uuid: eventRows.id,
        pw: password,
      });

      if (hashErr) return error(hashErr.message, 500);

      // Add bring list items (supports { name, quantity } objects or plain strings)
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
      if (!event_id || !password) return error("event_id and password are required");

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
      const password = url.searchParams.get("password");
      if (!event_id || !password) return error("id and password are required");

      // Verify password
      const { data: valid } = await supabase.rpc("__verify_event_password", {
        event_uuid: event_id,
        pw: password,
      });
      if (!valid) return error("Invalid password", 403);

      // Fetch event (exclude password_hash and admin_token)
      const { data: event } = await supabase
        .from("events")
        .select("id, name, description, event_date, event_time, location, banner_url, guest_visibility, bring_list_enabled, created_at")
        .eq("id", event_id)
        .single();

      if (!event) return error("Event not found", 404);

      // Fetch RSVPs
      const { data: rsvps } = await supabase
        .from("rsvps")
        .select("id, guest_name, adults, kids, created_at")
        .eq("event_id", event_id)
        .order("created_at", { ascending: true });

      // Fetch bring list
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
        .select("id, name, description, event_date, event_time, location, banner_url, guest_visibility, bring_list_enabled, admin_token, created_at")
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
      
      // Honeypot check
      if (honeypot) return json({ success: true }); // Silently accept but don't save

      if (!event_id || !password || !guest_name) return error("event_id, password, and guest_name are required");

      const { data: valid } = await supabase.rpc("__verify_event_password", { event_uuid: event_id, pw: password });
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
      if (!event_id || !password || !item_id || !claimed_by) return error("All fields required");

      const { data: valid } = await supabase.rpc("__verify_event_password", { event_uuid: event_id, pw: password });
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
      if (!event_id || !password || !item_name) return error("event_id, password, and item_name are required");

      const { data: valid } = await supabase.rpc("__verify_event_password", { event_uuid: event_id, pw: password });
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

      // Verify admin
      const { data: event } = await supabase
        .from("events")
        .select("id")
        .eq("id", event_id)
        .eq("admin_token", admin_token)
        .single();

      if (!event) return error("Invalid admin token", 403);

      // Filter allowed fields
      const allowed: Record<string, unknown> = {};
      for (const key of ["name", "description", "event_date", "event_time", "location", "banner_url", "guest_visibility", "bring_list_enabled"]) {
        if (updates[key] !== undefined) allowed[key] = updates[key];
      }

      if (Object.keys(allowed).length > 0) {
        const { error: err } = await supabase.from("events").update(allowed).eq("id", event_id);
        if (err) return error(err.message, 500);
      }

      return json({ success: true });
    }

    // POST /admin/add-bring-item - Admin add bring list item (supports quantity)
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

    // DELETE /admin/delete-bring-item - Admin delete bring list item
    if (req.method === "DELETE" && path === "admin/delete-bring-item") {
      const { event_id, admin_token, item_id } = await req.json();
      if (!event_id || !admin_token || !item_id) return error("All fields required");

      const { data: event } = await supabase.from("events").select("id").eq("id", event_id).eq("admin_token", admin_token).single();
      if (!event) return error("Invalid admin token", 403);

      await supabase.from("bring_list_items").delete().eq("id", item_id).eq("event_id", event_id);
      return json({ success: true });
    }

    // DELETE /admin/delete-rsvp - Admin delete RSVP
    if (req.method === "DELETE" && path === "admin/delete-rsvp") {
      const { event_id, admin_token, rsvp_id } = await req.json();
      if (!event_id || !admin_token || !rsvp_id) return error("All fields required");

      const { data: event } = await supabase.from("events").select("id").eq("id", event_id).eq("admin_token", admin_token).single();
      if (!event) return error("Invalid admin token", 403);

      await supabase.from("rsvps").delete().eq("id", rsvp_id).eq("event_id", event_id);
      return json({ success: true });
    }

    return error("Not found", 404);
  } catch (e) {
    return error(e.message || "Internal error", 500);
  }
});
