import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../../functions/api/[[route]]";
import { deliverEmail } from "../../server/email/deliver";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const EMAIL_ENV = {
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "Simple Events <events@test.example>",
  TURNSTILE_SITE_KEY: "site-key",
  TURNSTILE_SECRET_KEY: "secret-key",
};

async function call(method: string, path: string, body?: unknown, extraEnv: Record<string, unknown> = EMAIL_ENV) {
  const request = new Request(`https://events.test/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await onRequest({ request, env: { ...env, ...extraEnv } } as unknown as Parameters<typeof onRequest>[0]);
  return { status: response.status, body: (await response.json()) as Json };
}

/** Stub Turnstile and Resend. `sent` collects what was posted to Resend. */
function stubOutbound({ turnstile = true, resendStatus = 200 } = {}) {
  const sent: Array<{ payload: Json; headers: Record<string, string> }> = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (target.startsWith("https://challenges.cloudflare.com/")) return Response.json({ success: turnstile });
    if (target === "https://api.resend.com/emails") {
      sent.push({ payload: JSON.parse(init!.body as string), headers: init!.headers as Record<string, string> });
      return resendStatus === 200 ? Response.json({ id: "email_1" }) : new Response("nope", { status: resendStatus });
    }
    throw new Error(`Unexpected outbound request to ${target}`);
  });
  return { sent, spy };
}

const newEvent = (overrides: Json = {}) => ({ name: "Park picnic", event_date: "2030-06-01", ...overrides });
const withEmail = (overrides: Json = {}) => ({ email: "ada@example.com", turnstile_token: "tok", ...overrides });
const rows = async (table: string) => (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM email_sends"),
    env.DB.prepare("DELETE FROM bring_commitments"),
    env.DB.prepare("DELETE FROM bring_list_items"),
    env.DB.prepare("DELETE FROM rsvps"),
    env.DB.prepare("DELETE FROM events"),
  ]);
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/config", () => {
  it("reports email as enabled only when all four settings are present", async () => {
    expect((await call("GET", "config")).body).toEqual({ emailEnabled: true, turnstileSiteKey: "site-key" });
    expect((await call("GET", "config", undefined, {})).body).toEqual({ emailEnabled: false, turnstileSiteKey: null });
    const { TURNSTILE_SECRET_KEY: _omit, ...partial } = EMAIL_ENV;
    expect((await call("GET", "config", undefined, partial)).body).toEqual({ emailEnabled: false, turnstileSiteKey: null });
  });

  it("lets the browser reuse the answer, since it only changes on a deploy", async () => {
    const request = new Request("https://events.test/api/config");
    const response = await onRequest({ request, env: { ...env, ...EMAIL_ENV } } as unknown as Parameters<typeof onRequest>[0]);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
  });
});

describe("creating an event", () => {
  it("makes no outbound request and reports nothing when no email is given", async () => {
    const { spy } = stubOutbound();
    const res = await call("POST", "create", newEvent());
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("email");
    expect(spy).not.toHaveBeenCalled();
  });

  it("emails the host their links, without the password", async () => {
    const { sent } = stubOutbound();
    const res = await call("POST", "create", newEvent(withEmail({ email: " Ada@Example.COM ", password: "hunter2" })));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("sent");

    expect(sent).toHaveLength(1);
    const { payload, headers } = sent[0];
    expect(payload.from).toBe(EMAIL_ENV.EMAIL_FROM);
    expect(payload.to).toEqual(["ada@example.com"]);
    expect(payload.subject).toBe("Your links for Park picnic");
    expect(payload.html).toContain(`https://events.test/admin/${res.body.id}?token=${res.body.admin_token}`);
    expect(payload.text).toContain(`https://events.test/event/${res.body.id}`);
    expect(payload.text).toContain("Guests will need the password you set");
    expect(JSON.stringify(payload)).not.toContain("hunter2");

    const [send] = (await rows("email_sends")) as Json[];
    expect(headers["Idempotency-Key"]).toBe(`simple-events/${send.id}`);
    expect(headers.Authorization).toBe("Bearer re_test");
  });

  it("rejects an email before creating anything when email is off or the address is malformed", async () => {
    const { sent } = stubOutbound();

    const off = await call("POST", "create", newEvent(withEmail()), {});
    expect(off.status).toBe(400);
    expect(off.body.error).toBe("Email is not available");

    const malformed = await call("POST", "create", newEvent(withEmail({ email: "not-an-address" })));
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe("Enter a valid email address");

    expect(await rows("events")).toHaveLength(0);
    expect(await rows("email_sends")).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("creates the event but sends nothing when the bot check fails", async () => {
    // The email is the optional part: a failed or unreachable check must cost
    // the host their email, never their event.
    const { sent } = stubOutbound({ turnstile: false });
    const res = await call("POST", "create", newEvent(withEmail()));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("failed");
    expect(res.body.id).toEqual(expect.any(String));
    expect(await rows("events")).toHaveLength(1);
    expect(await rows("email_sends")).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("still creates the event when Resend fails", async () => {
    stubOutbound({ resendStatus: 500 });
    const res = await call("POST", "create", newEvent(withEmail()));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("failed");
    expect(await rows("events")).toHaveLength(1);
  });

  it("stops emailing one address after three sends in a day, but still creates the event", async () => {
    const { sent } = stubOutbound();
    for (let i = 0; i < 3; i++) expect((await call("POST", "create", newEvent(withEmail()))).body.email).toBe("sent");

    const res = await call("POST", "create", newEvent(withEmail({ email: "ADA@example.com" })));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("limited");
    expect(sent).toHaveLength(3);
    expect(await rows("events")).toHaveLength(4);
  });

  it("honours EMAIL_DAILY_CAP across addresses", async () => {
    const { sent } = stubOutbound();
    const capped = { ...EMAIL_ENV, EMAIL_DAILY_CAP: "1" };
    expect((await call("POST", "create", newEvent(withEmail()), capped)).body.email).toBe("sent");
    expect((await call("POST", "create", newEvent(withEmail({ email: "grace@example.com" })), capped)).body.email).toBe("limited");
    expect(sent).toHaveLength(1);
  });
});

describe("replying to an event", () => {
  it("emails the guest a confirmation with their edit link and a calendar file", async () => {
    const { sent } = stubOutbound();
    const event = (await call("POST", "create", newEvent({ event_time: "18:30", timezone: "Australia/Perth", location: "Kings Park" }))).body;
    const res = await call("POST", "rsvp", withEmail({ event_id: event.id, guest_name: "Ada", adults: 2, kids: 1, hour12: true }));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("sent");

    const { payload } = sent[0];
    expect(payload.to).toEqual(["ada@example.com"]);
    expect(payload.subject).toBe("You’re going to Park picnic");
    expect(payload.text).toContain(`https://events.test/event/${event.id}#manage=${res.body.id}.${res.body.manage_code}`);
    expect(payload.text).toContain("Saturday 1 June 2030, 6:30 pm (Australia/Perth)");
    expect(payload.text).toContain("2 adults, 1 kid");
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toBe("park-picnic.ics");
    expect(atob(payload.attachments[0].content)).toContain("SUMMARY:Park picnic");
  });

  it("lists what the guest is bringing", async () => {
    const { sent } = stubOutbound();
    const event = (await call("POST", "create", newEvent({ bring_list_mode: "signup", bring_items: [{ name: "Chairs", quantity: 4 }] }))).body;
    const { body } = await call("GET", `event?id=${event.id}`);
    await call("POST", "rsvp", withEmail({
      event_id: event.id, guest_name: "Ada", claim_items: [{ item_id: body.bring_items[0].id, quantity: 2 }],
    }));
    expect(sent[0].payload.text).toContain("Bringing: Chairs ×2");
  });

  it("saves the RSVP but sends nothing when the bot check fails", async () => {
    const { sent } = stubOutbound({ turnstile: false });
    const event = (await call("POST", "create", newEvent())).body;
    const res = await call("POST", "rsvp", withEmail({ event_id: event.id, guest_name: "Ada" }));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("failed");
    expect(res.body.manage_code).toEqual(expect.any(String));
    expect(await rows("rsvps")).toHaveLength(1);
    expect(await rows("email_sends")).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("still saves the RSVP when Resend fails", async () => {
    stubOutbound({ resendStatus: 500 });
    const event = (await call("POST", "create", newEvent())).body;
    const res = await call("POST", "rsvp", withEmail({ event_id: event.id, guest_name: "Ada" }));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("failed");
    expect(await rows("rsvps")).toHaveLength(1);
  });

  it("saves nothing if the event details for the email can't be read", async () => {
    stubOutbound();
    const event = (await call("POST", "create", newEvent())).body;
    // A database that fails only the read the confirmation email needs.
    const flakyDb = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "prepare") {
          return (sql: string) => {
            if (sql.includes("location_url FROM events")) throw new Error("injected read failure");
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    // The guest sees an error, so there must be no saved RSVP for a retry to duplicate.
    const res = await call("POST", "rsvp", withEmail({ event_id: event.id, guest_name: "Ada" }), { ...EMAIL_ENV, DB: flakyDb });
    expect(res.status).toBe(500);
    expect(await rows("rsvps")).toHaveLength(0);
  });

  it("sends nothing for a honeypot submission", async () => {
    const { spy } = stubOutbound();
    const event = (await call("POST", "create", newEvent())).body;
    await call("POST", "rsvp", withEmail({ event_id: event.id, guest_name: "Bot", honeypot: "x" }));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("deliverEmail", () => {
  it("reports failure instead of throwing when the email can't be composed", async () => {
    const { spy } = stubOutbound();
    const status = await deliverEmail(EMAIL_ENV, env.DB, "e1", "ada@example.com", () => {
      throw new Error("render failed");
    });
    expect(status).toBe("failed");
    expect(spy).not.toHaveBeenCalled();
    expect(await rows("email_sends")).toHaveLength(0);
  });
});

describe("storage", () => {
  it("never holds a readable address in any table", async () => {
    stubOutbound();
    const event = (await call("POST", "create", newEvent(withEmail()))).body;
    await call("POST", "rsvp", withEmail({ event_id: event.id, guest_name: "Ada", email: "grace@example.com" }));

    for (const table of ["events", "rsvps", "bring_list_items", "bring_commitments", "email_sends"]) {
      const dump = JSON.stringify(await rows(table));
      expect(dump, table).not.toContain("ada@example.com");
      expect(dump, table).not.toContain("grace@example.com");
    }
    expect(await rows("email_sends")).toHaveLength(2);
  });
});
