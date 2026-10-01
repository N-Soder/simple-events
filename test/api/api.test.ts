import { env } from "cloudflare:test";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { onRequest } from "../../functions/api/[[route]]";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const request = new Request(`https://events.test/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  // The API only reads request and env from the Pages context.
  const response = await onRequest({ request, env } as unknown as Parameters<typeof onRequest>[0]);
  return { status: response.status, body: (await response.json()) as Json };
}

async function createEvent(overrides: Json = {}) {
  const res = await call("POST", "create", { name: "Picnic", event_date: "2030-06-01", ...overrides });
  expect(res.status).toBe(200);
  return res.body as { id: string; admin_token: string };
}

async function upload(): Promise<string> {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "b.webp", { type: "image/webp" }));
  const request = new Request("https://events.test/api/upload", { method: "POST", body: form });
  const response = await onRequest({ request, env } as unknown as Parameters<typeof onRequest>[0]);
  return ((await response.json()) as Json).url;
}

const keyOf = (url: string) => url.split("/").pop()!;

describe("guest visibility", () => {
  it("only sends names in full mode and nothing in hidden mode", async () => {
    for (const [visibility, hasNames, hasCounts] of [["full", true, true], ["count_only", false, true], ["hidden", false, false]] as const) {
      const { id } = await createEvent({ guest_visibility: visibility });
      await call("POST", "rsvp", { event_id: id, guest_name: "Ada", adults: 2 });
      const { body } = await call("GET", `event?id=${id}`);
      expect(body.rsvps !== undefined).toBe(hasNames);
      expect(body.rsvp_counts !== undefined).toBe(hasCounts);
      expect(JSON.stringify(body)).not.toContain("manage_code");
    }
  });
});

describe("event passwords", () => {
  it("gates the event behind an access token from /verify", async () => {
    const { id } = await createEvent({ password: "hunter2" });

    expect((await call("GET", `event?id=${id}`)).status).toBe(403);
    expect((await call("POST", "verify", { event_id: id, password: "wrong" })).body).toEqual({ valid: false });

    const { body } = await call("POST", "verify", { event_id: id, password: "hunter2" });
    expect(body.valid).toBe(true);
    const token = body.access_token as string;

    expect((await call("GET", `event?id=${id}`, undefined, { "X-Event-Access": token })).status).toBe(200);
    expect((await call("POST", "rsvp", { event_id: id, guest_name: "Ada" })).status).toBe(403);
    expect((await call("POST", "rsvp", { event_id: id, guest_name: "Ada", access_token: token })).status).toBe(200);
  });

  it("invalidates old tokens when the host changes or removes the password", async () => {
    const { id, admin_token } = await createEvent({ password: "first" });
    const token = (await call("POST", "verify", { event_id: id, password: "first" })).body.access_token;

    await call("PUT", "admin/update", { event_id: id, admin_token, password: "second" });
    expect((await call("GET", `event?id=${id}`, undefined, { "X-Event-Access": token })).status).toBe(403);
    expect((await call("POST", "verify", { event_id: id, password: "second" })).body.valid).toBe(true);

    await call("PUT", "admin/update", { event_id: id, admin_token, password: null });
    expect((await call("GET", `event?id=${id}`)).status).toBe(200);
    expect((await call("GET", `admin?id=${id}&token=${admin_token}`)).body.event.has_password).toBe(false);
  });

  it("accepts legacy bcrypt hashes and upgrades them on first use", async () => {
    const { id } = await createEvent();
    await env.DB.prepare("UPDATE events SET password_hash = ? WHERE id = ?").bind(bcrypt.hashSync("old", 4), id).run();

    expect((await call("POST", "verify", { event_id: id, password: "old" })).body.valid).toBe(true);
    const row = await env.DB.prepare("SELECT password_hash FROM events WHERE id = ?").bind(id).first<{ password_hash: string }>();
    expect(row!.password_hash.startsWith("pbkdf2-sha256$")).toBe(true);
    expect((await call("POST", "verify", { event_id: id, password: "old" })).body.valid).toBe(true);
  });
});

describe("admin routes", () => {
  it("reject a wrong admin token", async () => {
    const { id } = await createEvent();
    const bad = { event_id: id, admin_token: "nope" };
    expect((await call("PUT", "admin/update", { ...bad, name: "x" })).status).toBe(403);
    expect((await call("POST", "admin/add-bring-item", { ...bad, item_name: "x" })).status).toBe(403);
    expect((await call("DELETE", "admin/delete-bring-item", { ...bad, item_id: "x" })).status).toBe(403);
    expect((await call("DELETE", "admin/delete-rsvp", { ...bad, rsvp_id: "x" })).status).toBe(403);
    expect((await call("DELETE", "admin/delete-event", bad)).status).toBe(403);
    expect((await call("GET", `admin?id=${id}&token=nope`)).status).toBe(403);
  });
});

describe("banners", () => {
  it("refuses a banner_url that is not one of our uploads or presets", async () => {
    for (const banner_url of ["https://evil.test/x.webp", "/banners/../x", "javascript:alert(1)", "/banners/not-a-uuid.webp"]) {
      expect((await call("POST", "create", { name: "x", event_date: "2030-01-01", banner_url })).status).toBe(400);
    }
    expect((await call("POST", "create", { name: "x", event_date: "2030-01-01", banner_url: "/banner-presets/picnic.webp" })).status).toBe(200);
  });

  it("does not let one host delete another host's banner", async () => {
    const victimBanner = await upload();
    await createEvent({ banner_url: victimBanner });

    // Adopt the victim's URL, then drop it, then delete the event.
    const attacker = await createEvent({ banner_url: victimBanner });
    await call("PUT", "admin/update", { event_id: attacker.id, admin_token: attacker.admin_token, banner_url: null });
    const attacker2 = await createEvent({ banner_url: victimBanner });
    await call("DELETE", "admin/delete-event", { event_id: attacker2.id, admin_token: attacker2.admin_token });

    expect(await env.R2.head(keyOf(victimBanner))).not.toBeNull();
  });

  it("deletes a host's own banner once it is replaced", async () => {
    const first = await upload();
    const { id, admin_token } = await createEvent({ banner_url: first });
    await call("PUT", "admin/update", { event_id: id, admin_token, banner_url: await upload() });
    expect(await env.R2.head(keyOf(first))).toBeNull();
  });
});

describe("RSVPs with bring list claims", () => {
  async function signupEvent() {
    const event = await createEvent({ bring_list_mode: "signup", bring_items: [{ name: "Chairs", quantity: 3 }] });
    const items = (await call("GET", `event?id=${event.id}`)).body.bring_items;
    return { ...event, itemId: items[0].id as string };
  }

  it("records the RSVP and its claims together and reports what was reserved", async () => {
    const { id, itemId } = await signupEvent();
    const res = await call("POST", "rsvp", { event_id: id, guest_name: "Ada", claim_items: [{ item_id: itemId, quantity: 2, note: " red " }] });
    expect(res.status).toBe(200);
    expect(res.body.reserved).toEqual([{ item_name: "Chairs", quantity: 2 }]);
    const item = (await call("GET", `event?id=${id}`)).body.bring_items[0];
    expect(item.committed_quantity).toBe(2);
    expect(item.commitments[0].note).toBe("red");
  });

  it("refuses an over-full claim without creating the RSVP", async () => {
    const { id, itemId } = await signupEvent();
    await call("POST", "rsvp", { event_id: id, guest_name: "Ada", claim_items: [{ item_id: itemId, quantity: 2 }] });
    const res = await call("POST", "rsvp", { event_id: id, guest_name: "Bo", claim_items: [{ item_id: itemId, quantity: 2 }] });
    expect(res.status).toBe(409);
    expect((await call("GET", `event?id=${id}`)).body.rsvp_counts.count).toBe(1);
  });

  it("lets a guest re-submit their own claims when editing", async () => {
    const { id, itemId } = await signupEvent();
    const rsvp = (await call("POST", "rsvp", { event_id: id, guest_name: "Ada", claim_items: [{ item_id: itemId, quantity: 3 }] })).body;
    const mine = (await call("GET", `rsvp/manage?event_id=${id}&rsvp_id=${rsvp.id}&code=${rsvp.manage_code}`)).body.claimed_items;

    const res = await call("PUT", "rsvp/update", {
      rsvp_id: rsvp.id, manage_code: rsvp.manage_code, guest_name: "Ada L",
      unclaim_item_ids: mine.map((c: Json) => c.id), claim_items: [{ item_id: itemId, quantity: 3 }],
    });
    expect(res.status).toBe(200);
    const item = (await call("GET", `event?id=${id}`)).body.bring_items[0];
    expect(item.committed_quantity).toBe(3);
    expect(item.commitments[0].guest_name).toBe("Ada L");
  });

  it("releases every claim when an RSVP is cancelled", async () => {
    const { id, itemId } = await signupEvent();
    const rsvp = (await call("POST", "rsvp", { event_id: id, guest_name: "Ada", claim_items: [{ item_id: itemId, quantity: 3 }] })).body;
    await call("PUT", "rsvp/update", { rsvp_id: rsvp.id, manage_code: rsvp.manage_code, cancelled: true });
    expect((await call("GET", `event?id=${id}`)).body.bring_items[0].committed_quantity).toBe(0);
  });

  it("blocks custom items in sign-up mode", async () => {
    const { id } = await signupEvent();
    const res = await call("POST", "rsvp", { event_id: id, guest_name: "Ada", custom_items: [{ item_name: "Cake" }] });
    expect(res.status).toBe(403);
  });
});

describe("input validation", () => {
  it("answers malformed requests with 400, not 500", async () => {
    expect((await call("POST", "create", "{not json")).status).toBe(400);
    expect((await call("POST", "create", { name: 42, event_date: "2030-01-01" })).status).toBe(400);
    const { id } = await createEvent();
    expect((await call("POST", "rsvp", { event_id: id, guest_name: { a: 1 } })).status).toBe(400);
    expect((await call("POST", "rsvp", { event_id: id, guest_name: "Ada", adults: "lots" })).status).toBe(400);
    expect((await call("POST", "create", { name: "x", event_date: "2030-01-01", bring_items: Array(101).fill("a") })).status).toBe(400);
  });
});
