# Optional Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a host or guest optionally have their links emailed to them once, without Simple Events storing the address.

**Architecture:** Three small server modules under `server/email/` (send caps, Resend client, templates) plus a Turnstile verifier, wired into the existing `create` and `rsvp` routes behind a `GET /api/config` feature switch. The client gets one shared `EmailField` (input + lazy invisible Turnstile) used by the create form and the RSVP form, and a `/privacy` page.

**Tech Stack:** Cloudflare Pages Functions, D1, Resend REST API, Cloudflare Turnstile, React 18, Vitest (jsdom for `src/`, workerd for `test/api/`).

**Spec:** `docs/superpowers/specs/2026-10-10-optional-email-design.md`

## Global Constraints

- Email addresses are never written to D1 in readable form and never logged. Only `hashAddress()` output is stored.
- `emailEnabled` is true only when `RESEND_API_KEY`, `EMAIL_FROM`, `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are all set. With none set the app behaves exactly as before.
- Caps per 24 hours: 3 per address, 100 per event, `EMAIL_DAILY_CAP` overall (default 80).
- Over a cap or a failed send never fails the event or RSVP; the response carries `email: "sent" | "failed" | "limited"`.
- A bad address, email-while-disabled (400) or failed Turnstile (403) is rejected before anything is written.
- The event password never appears in an email. Tokens and provider response bodies are never logged.
- No new npm dependencies.
- Match the surrounding code: double quotes, semicolons, comment density of the file being edited.
- User-facing copy uses curly apostrophes (’) like the rest of `src/`.

## Execution: three parallel workstreams in ONE worktree

| Stream | Model | Tasks | Owns these files (nobody else edits them) |
|---|---|---|---|
| S | Sonnet | S1–S4 | `migrations/`, `server/`, `functions/`, `cleanup-worker/`, `test/api/`, `src/lib/ics.ts`, `src/components/AddToCalendarButton.tsx` |
| A | Haiku | A1–A3 | `src/lib/api.ts`, `src/lib/email.ts`, `src/lib/turnstile.ts`, `src/hooks/use-email-config.ts`, `src/components/EmailField*`, `src/components/RsvpSuccessScreen.tsx`, `src/pages/CreateEvent*`, `src/pages/EventCreated*`, `src/pages/EventPage*` |
| B | Haiku | B1–B2 | `src/pages/PrivacyPage*`, `src/App.tsx`, `src/pages/LandingPage.tsx`, `public/_headers`, `wrangler.toml`, `.dev.vars.example`, `.gitignore`, `README.md` |

Rules for every stream:

- **Do not run any `git` command that writes** (`add`, `commit`, `stash`, `checkout`, `restore`). The coordinator commits. Other streams are editing the same worktree at the same time.
- **Do not edit files outside your column.** If you think you must, stop and report instead.
- `node_modules` is already installed. Do not run `npm install` or `npm ci`.
- Run only your own tests while working (commands are given per task). `npm run typecheck` and `npm run lint` may show errors from another stream's half-written files; report only errors in files you own.
- The contract between streams is fixed by this plan (see each task's Interfaces). Do not rename anything in it.

## Review Focus

1. **Event name with line breaks or control characters** → the email subject must be one clean line (S3 test).
2. **Hostile HTML in event name, guest name, location, item names** → rendered as text, never markup (S3 test).
3. **Address with different capitalisation or padding** (`" Ada@Example.COM "`) → counts as the same address for the cap and is sent lower-cased (S1, S4 tests).
4. **A failed request after the bot check ran** (full bring-list slot, server error) → the guest can fix it and submit again; the field gets a fresh token (A1, A3 tests).
5. **Turnstile blocked by an ad blocker or offline** → the field says email isn't available and the person can clear it and submit without email (A1 test).

---

## Stream S: server

### Task S1: send caps

**Files:**
- Create: `migrations/d1/0008_email_sends.sql`
- Create: `server/email/limits.ts`
- Modify: `cleanup-worker/src/index.ts`
- Test: `test/api/email-limits.test.ts`

**Interfaces:**
- Produces:
  - `normalizeEmail(value: string): string | null`
  - `hashAddress(secret: string, address: string): Promise<string>`
  - `reserveSend(db: D1Database, secret: string, address: string, eventId: string, dailyCap: number): Promise<string | null>` (the new row id, or null when over a cap)
  - `purgeOldSends(db: D1Database): Promise<number>`
  - constants `PER_ADDRESS_CAP = 3`, `PER_EVENT_CAP = 100`, `DEFAULT_DAILY_CAP = 80`

- [ ] **Step 1: Write the migration**

`migrations/d1/0008_email_sends.sql`:

```sql
-- One row per email the app has tried to send, kept for 48 hours so the daily
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
```

- [ ] **Step 2: Write the failing test**

`test/api/email-limits.test.ts`:

```ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  hashAddress, normalizeEmail, purgeOldSends, reserveSend, PER_ADDRESS_CAP, PER_EVENT_CAP,
} from "../../server/email/limits";

const SECRET = "re_test_key";
const count = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM email_sends").first<{ n: number }>())!.n;

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM email_sends").run();
});

describe("normalizeEmail", () => {
  it("trims and lower-cases a valid address", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(normalizeEmail("first.last+tag@sub.example.co.uk")).toBe("first.last+tag@sub.example.co.uk");
  });

  it("rejects anything that is not a single plain address", () => {
    for (const bad of [
      "", "ada", "ada@", "@example.com", "ada@example", "a b@example.com", "ada@exa mple.com",
      "ada@example.com\nbcc:x@y.zz", "Ada <ada@example.com>", "a@b.cc,d@e.ff", "a@b.cc;d@e.ff",
      `${"x".repeat(250)}@example.com`,
    ]) {
      expect(normalizeEmail(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("hashAddress", () => {
  it("is stable, keyed, and does not contain the address", async () => {
    const hash = await hashAddress(SECRET, "ada@example.com");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashAddress(SECRET, "ada@example.com")).toBe(hash);
    expect(await hashAddress("another-key", "ada@example.com")).not.toBe(hash);
    expect(hash).not.toContain("ada");
  });
});

describe("reserveSend", () => {
  it("allows PER_ADDRESS_CAP sends to one address, then refuses", async () => {
    for (let i = 0; i < PER_ADDRESS_CAP; i++) {
      expect(await reserveSend(env.DB, SECRET, "ada@example.com", `event-${i}`, 1000)).toEqual(expect.any(String));
    }
    expect(await reserveSend(env.DB, SECRET, "ada@example.com", "event-x", 1000)).toBeNull();
    expect(await reserveSend(env.DB, SECRET, "grace@example.com", "event-x", 1000)).toEqual(expect.any(String));
  });

  it("refuses once an event has reached PER_EVENT_CAP", async () => {
    const insert = env.DB.prepare("INSERT INTO email_sends (id, address_hash, event_id) VALUES (?, ?, 'busy')");
    await env.DB.batch(Array.from({ length: PER_EVENT_CAP }, (_, i) => insert.bind(`row-${i}`, `hash-${i}`)));

    expect(await reserveSend(env.DB, SECRET, "ada@example.com", "busy", 1000)).toBeNull();
    expect(await reserveSend(env.DB, SECRET, "ada@example.com", "quiet", 1000)).toEqual(expect.any(String));
  });

  it("refuses once the overall daily cap is reached", async () => {
    expect(await reserveSend(env.DB, SECRET, "a@example.com", "e1", 2)).toEqual(expect.any(String));
    expect(await reserveSend(env.DB, SECRET, "b@example.com", "e2", 2)).toEqual(expect.any(String));
    expect(await reserveSend(env.DB, SECRET, "c@example.com", "e3", 2)).toBeNull();
    expect(await count()).toBe(2);
  });

  it("ignores sends older than 24 hours", async () => {
    const hash = await hashAddress(SECRET, "ada@example.com");
    const insert = env.DB.prepare(
      "INSERT INTO email_sends (id, address_hash, event_id, sent_at) VALUES (?, ?, 'old', datetime('now', '-25 hours'))",
    );
    await env.DB.batch(Array.from({ length: PER_ADDRESS_CAP }, (_, i) => insert.bind(`old-${i}`, hash)));

    expect(await reserveSend(env.DB, SECRET, "ada@example.com", "old", 1000)).toEqual(expect.any(String));
  });

  it("stores the hash and never the address", async () => {
    const id = await reserveSend(env.DB, SECRET, "ada@example.com", "e1", 1000);
    const row = await env.DB.prepare("SELECT * FROM email_sends WHERE id = ?").bind(id).first<Record<string, unknown>>();
    expect(row!.address_hash).toBe(await hashAddress(SECRET, "ada@example.com"));
    expect(JSON.stringify(row)).not.toContain("ada@example.com");
  });
});

describe("purgeOldSends", () => {
  it("deletes rows older than 48 hours and keeps recent ones", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO email_sends (id, address_hash, event_id, sent_at) VALUES ('old', 'h', 'e', datetime('now', '-49 hours'))"),
      env.DB.prepare("INSERT INTO email_sends (id, address_hash, event_id, sent_at) VALUES ('recent', 'h', 'e', datetime('now', '-47 hours'))"),
    ]);
    expect(await purgeOldSends(env.DB)).toBe(1);
    const { results } = await env.DB.prepare("SELECT id FROM email_sends").all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(["recent"]);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run -c vitest.api.config.ts test/api/email-limits.test.ts`
Expected: FAIL, cannot resolve `../../server/email/limits`.

- [ ] **Step 4: Implement**

`server/email/limits.ts`:

```ts
// Send caps for the optional emails. An open email field lets anyone make us
// send mail to any address, so every send first reserves a slot here.

const MAX_EMAIL_LENGTH = 254;
// One plain address: no spaces, no display name, no list separators, and a
// domain with at least one dot.
const EMAIL_RE = /^[^\s@<>(),;:"[\]\\]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export const PER_ADDRESS_CAP = 3;
export const PER_EVENT_CAP = 100;
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
 * Reserve one send, or return null if any 24-hour cap is already reached. The
 * check and the insert are one statement, so concurrent requests cannot both
 * take the last slot. The row is kept even if the send then fails, so failures
 * count against the caps too.
 */
export async function reserveSend(
  db: D1Database, secret: string, address: string, eventId: string, dailyCap: number,
): Promise<string | null> {
  const id = crypto.randomUUID();
  const hash = await hashAddress(secret, address);
  const result = await db.prepare(
    `INSERT INTO email_sends (id, address_hash, event_id)
     SELECT ?1, ?2, ?3
     WHERE (SELECT COUNT(*) FROM email_sends WHERE address_hash = ?2 AND sent_at > datetime('now', '-1 day')) < ?4
       AND (SELECT COUNT(*) FROM email_sends WHERE event_id = ?3 AND sent_at > datetime('now', '-1 day')) < ?5
       AND (SELECT COUNT(*) FROM email_sends WHERE sent_at > datetime('now', '-1 day')) < ?6`
  ).bind(id, hash, eventId, PER_ADDRESS_CAP, PER_EVENT_CAP, dailyCap).run();
  return result.meta.changes > 0 ? id : null;
}

/** Drop rows the caps no longer look at. Run nightly by the cleanup worker. */
export async function purgeOldSends(db: D1Database): Promise<number> {
  const result = await db.prepare("DELETE FROM email_sends WHERE sent_at < datetime('now', '-2 days')").run();
  return result.meta.changes;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run -c vitest.api.config.ts test/api/email-limits.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Call the purge from the cleanup worker**

In `cleanup-worker/src/index.ts`, add the import under the existing one:

```ts
import { purgeOldSends } from "../../server/email/limits";
```

and change `runCleanup` to:

```ts
async function runCleanup(env: Env): Promise<void> {
  await deleteExpiredEvents(env);
  await sweepOrphanedBanners(env);
  const purged = await purgeOldSends(env.DB);
  if (purged > 0) console.log(`Cleanup complete: purged ${purged} email send record(s).`);
}
```

Run: `npx tsc -p tsconfig.server.json`
Expected: no errors in `server/` or `cleanup-worker/`.

### Task S2: Resend client and Turnstile verifier

**Files:**
- Create: `server/email/resend.ts`, `server/turnstile.ts`
- Test: `test/api/email-transport.test.ts`

**Interfaces:**
- Produces:
  - `interface EmailAttachment { filename: string; content: string; content_type?: string }` (`content` is base64)
  - `interface EmailPayload { from: string; to: string[]; subject: string; html: string; text: string; attachments?: EmailAttachment[] }`
  - `sendEmail(apiKey: string, idempotencyKey: string, payload: EmailPayload): Promise<boolean>` (never throws)
  - `verifyTurnstile(secret: string | undefined, token: unknown, ip: string | null): Promise<boolean>` (never throws)

- [ ] **Step 1: Write the failing test**

`test/api/email-transport.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail, type EmailPayload } from "../../server/email/resend";
import { verifyTurnstile } from "../../server/turnstile";

const payload: EmailPayload = {
  from: "Simple Events <events@test.example>", to: ["ada@example.com"],
  subject: "Hello", html: "<p>Hi</p>", text: "Hi",
};

function mockFetch(...responses: Array<Response | Error>) {
  const spy = vi.spyOn(globalThis, "fetch");
  for (const r of responses) {
    if (r instanceof Error) spy.mockRejectedValueOnce(r);
    else spy.mockResolvedValueOnce(r);
  }
  return spy;
}

afterEach(() => vi.restoreAllMocks());

describe("sendEmail", () => {
  it("posts the payload to Resend with the key and idempotency key", async () => {
    const spy = mockFetch(Response.json({ id: "email_1" }));
    expect(await sendEmail("re_key", "simple-events/abc", payload)).toBe(true);

    const [target, init] = spy.mock.calls[0];
    expect(target).toBe("https://api.resend.com/emails");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_key");
    expect(headers["Idempotency-Key"]).toBe("simple-events/abc");
    expect(JSON.parse(init!.body as string)).toEqual(payload);
  });

  it("reports failure on an error status, a reply without an id, or a network error", async () => {
    mockFetch(new Response("nope", { status: 500 }));
    expect(await sendEmail("k", "i", payload)).toBe(false);
    mockFetch(Response.json({}));
    expect(await sendEmail("k", "i", payload)).toBe(false);
    mockFetch(new Error("offline"));
    expect(await sendEmail("k", "i", payload)).toBe(false);
  });

  it("retries once after a short rate limit", async () => {
    const spy = mockFetch(new Response(null, { status: 429, headers: { "Retry-After": "0" } }), Response.json({ id: "email_2" }));
    expect(await sendEmail("k", "i", payload)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("gives up on a long rate limit, and on a second 429", async () => {
    let spy = mockFetch(new Response(null, { status: 429, headers: { "Retry-After": "60" } }));
    expect(await sendEmail("k", "i", payload)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    spy = mockFetch(
      new Response(null, { status: 429, headers: { "Retry-After": "0" } }),
      new Response(null, { status: 429, headers: { "Retry-After": "0" } }),
    );
    expect(await sendEmail("k", "i", payload)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("verifyTurnstile", () => {
  it("fails closed without a secret or a token, and makes no request", async () => {
    const spy = mockFetch();
    expect(await verifyTurnstile(undefined, "tok", null)).toBe(false);
    expect(await verifyTurnstile("secret", undefined, null)).toBe(false);
    expect(await verifyTurnstile("secret", "", null)).toBe(false);
    expect(await verifyTurnstile("secret", 42, null)).toBe(false);
    expect(await verifyTurnstile("secret", "x".repeat(2049), null)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends the secret, token and IP, and trusts only success: true", async () => {
    const spy = mockFetch(Response.json({ success: true }));
    expect(await verifyTurnstile("secret", "tok", "203.0.113.9")).toBe(true);
    const [target, init] = spy.mock.calls[0];
    expect(target).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const form = init!.body as FormData;
    expect(form.get("secret")).toBe("secret");
    expect(form.get("response")).toBe("tok");
    expect(form.get("remoteip")).toBe("203.0.113.9");
  });

  it("fails on a negative answer, an error status, or a network error", async () => {
    mockFetch(Response.json({ success: false }));
    expect(await verifyTurnstile("secret", "tok", null)).toBe(false);
    mockFetch(new Response("nope", { status: 500 }));
    expect(await verifyTurnstile("secret", "tok", null)).toBe(false);
    mockFetch(new Error("offline"));
    expect(await verifyTurnstile("secret", "tok", null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run -c vitest.api.config.ts test/api/email-transport.test.ts`
Expected: FAIL, cannot resolve the modules.

- [ ] **Step 3: Implement**

`server/email/resend.ts`:

```ts
export interface EmailAttachment {
  filename: string;
  /** Base64. */
  content: string;
  content_type?: string;
}

export interface EmailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;
// Longest rate-limit wait worth holding the person's request open for.
const MAX_RETRY_AFTER_SECONDS = 3;

/**
 * Send one email. Resolves to whether Resend accepted it; never throws. Only
 * the HTTP status is logged: provider bodies can echo the recipient's address.
 */
export async function sendEmail(apiKey: string, idempotencyKey: string, payload: EmailPayload): Promise<boolean> {
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 429 && attempt === 0) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        if (!Number.isFinite(retryAfter) || retryAfter < 0 || retryAfter > MAX_RETRY_AFTER_SECONDS) {
          console.error("Email send failed: rate limited");
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      if (!response.ok) {
        console.error(`Email send failed: status ${response.status}`);
        return false;
      }
      const body = (await response.json()) as { id?: unknown };
      return typeof body.id === "string" && body.id.length > 0;
    }
    return false;
  } catch {
    console.error("Email send failed: request error");
    return false;
  }
}
```

`server/turnstile.ts`:

```ts
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Check a Turnstile token. Fails closed: a missing secret, a missing token or
 * a network error all count as a failed check.
 */
export async function verifyTurnstile(secret: string | undefined, token: unknown, ip: string | null): Promise<boolean> {
  if (!secret || typeof token !== "string" || token === "" || token.length > 2048) return false;

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  try {
    const response = await fetch(VERIFY_URL, { method: "POST", body: form });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run -c vitest.api.config.ts test/api/email-transport.test.ts`
Expected: PASS, 7 tests.

### Task S3: templates and the calendar attachment

**Files:**
- Modify: `src/lib/ics.ts` (remove `downloadIcs`), `src/components/AddToCalendarButton.tsx` (receive it)
- Create: `server/email/templates.ts`
- Test: `test/api/email-templates.test.ts`

**Interfaces:**
- Consumes: `EmailAttachment` from `./resend`; `buildIcs`, `googleCalendarUrl`, `icsFilename`, `CalendarEvent` from `src/lib/ics`; `isSafeHttpUrl` from `src/lib/url`.
- Produces:
  - `interface RenderedEmail { subject: string; html: string; text: string }`
  - `interface EmailEvent { id: string; name: string; event_date: string; event_time: string | null; event_end_time: string | null; timezone: string | null; location: string | null; location_url: string | null }`
  - `renderHostLinksEmail(input: { origin: string; event: Pick<EmailEvent, "id" | "name" | "event_date">; adminToken: string; hasPassword: boolean }): RenderedEmail`
  - `renderRsvpEmail(input: { origin: string; event: EmailEvent; rsvp: { id: string; manage_code: string; guest_name: string; adults: number; kids: number }; bringing: string[]; hour12: boolean }): RenderedEmail`
  - `rsvpCalendarAttachment(origin: string, event: EmailEvent): EmailAttachment`

- [ ] **Step 1: Move the only DOM code out of `src/lib/ics.ts`**

The server will import `src/lib/ics.ts`, and `tsconfig.server.json` has no DOM types, so `downloadIcs` has to leave. Delete the whole `downloadIcs` function and its doc comment from the end of `src/lib/ics.ts`.

In `src/components/AddToCalendarButton.tsx`, change the import and add the function above the component:

```tsx
import { CalendarEvent, buildIcs, googleCalendarUrl, icsFilename } from "@/lib/ics";
```

```tsx
/** Trigger a browser download of the event's .ics file. */
function downloadIcs(event: CalendarEvent): void {
  const blob = new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = icsFilename(event.name);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

Run: `grep -rn downloadIcs src` — expected: only `AddToCalendarButton.tsx`.
Run: `npx vitest run src/lib/ics.test.ts` — expected: PASS.

- [ ] **Step 2: Write the failing test**

`test/api/email-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderHostLinksEmail, renderRsvpEmail, rsvpCalendarAttachment, type EmailEvent } from "../../server/email/templates";

const origin = "https://events.test";
const event: EmailEvent = {
  id: "ev1", name: "Park picnic", event_date: "2030-06-01", event_time: "18:30", event_end_time: "22:00",
  timezone: "Australia/Perth", location: "Kings Park", location_url: "https://maps.example/kings-park",
};
const rsvp = { id: "r1", manage_code: "c1", guest_name: "Ada", adults: 2, kids: 1 };

describe("renderHostLinksEmail", () => {
  it("contains both links in the HTML and the text", () => {
    const email = renderHostLinksEmail({ origin, event, adminToken: "tok123", hasPassword: false });
    expect(email.subject).toBe("Your links for Park picnic");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("https://events.test/admin/ev1?token=tok123");
      expect(part).toContain("https://events.test/event/ev1");
      expect(part).toContain("Saturday 1 June 2030");
      expect(part).toContain("https://events.test/privacy");
      expect(part).toContain("entered on events.test");
      expect(part).not.toContain("password");
    }
  });

  it("mentions the password without including it when the event has one", () => {
    const email = renderHostLinksEmail({ origin, event, adminToken: "tok123", hasPassword: true });
    expect(email.html).toContain("Guests will need the password you set");
    expect(email.text).toContain("Guests will need the password you set");
  });

  it("escapes hostile text and keeps the subject on one line", () => {
    const hostile = { ...event, name: `<script>alert(1)</script> "x" & y\r\nBcc: evil@example.com` };
    const email = renderHostLinksEmail({ origin, event: hostile, adminToken: "tok123", hasPassword: false });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &quot;x&quot; &amp; y");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject).toBe(`Your links for <script>alert(1)</script> "x" & y Bcc: evil@example.com`);
  });
});

describe("renderRsvpEmail", () => {
  it("contains the event, the reply and the private edit link", () => {
    const email = renderRsvpEmail({ origin, event, rsvp, bringing: ["Chairs ×2", "Salad"], hour12: true });
    expect(email.subject).toBe("You’re going to Park picnic");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("https://events.test/event/ev1#manage=r1.c1");
      expect(part).toContain("Saturday 1 June 2030, 6:30 pm to 10:00 pm (Australia/Perth)");
      expect(part).toContain("Kings Park");
      expect(part).toContain("2 adults, 1 kid");
      expect(part).toContain("Chairs ×2, Salad");
      expect(part).toContain("https://events.test/privacy");
    }
    expect(email.text).toContain("https://calendar.google.com/calendar/render?");
    expect(email.html).toContain('href="https://maps.example/kings-park"');
  });

  it("uses the 24-hour clock when asked, and handles all-day events", () => {
    expect(renderRsvpEmail({ origin, event, rsvp, bringing: [], hour12: false }).text)
      .toContain("Saturday 1 June 2030, 18:30 to 22:00 (Australia/Perth)");

    const allDay = { ...event, event_time: null, event_end_time: null, timezone: null, location: null, location_url: null };
    const email = renderRsvpEmail({ origin, event: allDay, rsvp: { ...rsvp, adults: 1, kids: 0 }, bringing: [], hour12: true });
    expect(email.text).toContain("When: Saturday 1 June 2030\n");
    expect(email.text).toContain("1 adult");
    expect(email.text).not.toContain("Where:");
    expect(email.text).not.toContain("Bringing:");
  });

  it("escapes hostile guest, location and item text", () => {
    const hostile = { ...event, location: "<img src=x onerror=alert(1)>", location_url: "javascript:alert(1)" };
    const email = renderRsvpEmail({
      origin, event: hostile, rsvp: { ...rsvp, guest_name: "<b>Ada</b>" }, bringing: ["<i>Chips</i>"], hour12: true,
    });
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("<b>Ada</b>");
    expect(email.html).not.toContain("<i>Chips</i>");
    expect(email.html).not.toContain("javascript:");
  });
});

describe("rsvpCalendarAttachment", () => {
  it("is a base64 .ics for the event, without a description", () => {
    const attachment = rsvpCalendarAttachment(origin, event);
    expect(attachment.filename).toBe("park-picnic.ics");
    expect(attachment.content_type).toBe("text/calendar");
    const ics = atob(attachment.content);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("SUMMARY:Park picnic");
    expect(ics).toContain("https://events.test/event/ev1");
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run -c vitest.api.config.ts test/api/email-templates.test.ts`
Expected: FAIL, cannot resolve `../../server/email/templates`.

- [ ] **Step 4: Implement**

`server/email/templates.ts`:

```ts
// The two emails Simple Events sends. Pure functions: everything they need is
// passed in, and every piece of user-supplied text is escaped on the way out.

import { buildIcs, googleCalendarUrl, icsFilename, type CalendarEvent } from "../../src/lib/ics";
import { isSafeHttpUrl } from "../../src/lib/url";
import type { EmailAttachment } from "./resend";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailEvent {
  id: string;
  name: string;
  event_date: string;
  event_time: string | null;
  event_end_time: string | null;
  timezone: string | null;
  location: string | null;
  location_url: string | null;
}

// The light theme tokens from src/index.css as hex, since email clients need
// inline colours. Fonts fall back to Georgia and Helvetica where DM is absent.
const C = { bg: "#FCFAF8", card: "#FFFFFF", ink: "#1D212B", muted: "#6A7181", line: "#E7E4DF", panel: "#F5F3F0", primary: "#358C61" };
const SANS = "'DM Sans',Helvetica,Arial,sans-serif";
const SERIF = "'DM Serif Display',Georgia,'Times New Roman',serif";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Collapse line breaks and control characters, so a name is safe as a subject. */
const oneLine = (value: string) => value.replace(/[\p{Cc}\s]+/gu, " ").trim();

// Names are spelled out by hand rather than through Intl, because the Workers
// runtime does not carry locale data for anything but en-US.
function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(utc.getTime())) return date;
  return `${WEEKDAYS[utc.getUTCDay()]} ${day} ${MONTHS[month - 1]} ${year}`;
}

function formatTime(time: string, hour12: boolean): string {
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return time;
  const mm = String(minute).padStart(2, "0");
  return hour12 ? `${hour % 12 || 12}:${mm} ${hour >= 12 ? "pm" : "am"}` : `${String(hour).padStart(2, "0")}:${mm}`;
}

function formatWhen(event: EmailEvent, hour12: boolean): string {
  const date = formatDate(event.event_date);
  if (!event.event_time) return date;
  const start = formatTime(event.event_time, hour12);
  const range = event.event_end_time ? `${start} to ${formatTime(event.event_end_time, hour12)}` : start;
  return `${date}, ${range}${event.timezone ? ` (${event.timezone.replace(/_/g, " ")})` : ""}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface Row { label: string; value: string; href?: string }
interface Layout {
  origin: string;
  subject: string;
  eyebrow: string;
  heading: string;
  intro: string;
  rows: Row[];
  button: { label: string; href: string };
  /** A second link, shown in full under the button. */
  secondary: { label: string; href: string };
  notes: string[];
}

function render(layout: Layout): RenderedEmail {
  const host = new URL(layout.origin).host;
  const privacy = `${layout.origin}/privacy`;
  const why = `You’re getting this because this address was entered on ${host}. It was used once and isn’t stored, so you won’t hear from us again.`;
  const e = escapeHtml;

  const rows = layout.rows.map((row) => {
    const value = row.href
      ? `<a href="${e(row.href)}" style="color:${C.primary};">${e(row.value)}</a>`
      : e(row.value);
    return `<tr><td style="padding:3px 16px 3px 0;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${C.muted};white-space:nowrap;vertical-align:top;">${e(row.label)}</td><td style="padding:3px 0;font-size:15px;line-height:1.5;color:${C.ink};">${value}</td></tr>`;
  }).join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${e(layout.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;">${e(layout.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:12px;">
<tr><td style="padding:28px 28px 0;font-family:${SANS};font-size:15px;font-weight:500;color:${C.ink};">Simple Events</td></tr>
<tr><td style="padding:24px 28px 0;font-family:${SANS};">
<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.primary};">${e(layout.eyebrow)}</p>
<h1 style="margin:0 0 14px;font-family:${SERIF};font-weight:400;font-size:28px;line-height:1.2;color:${C.ink};">${e(layout.heading)}</h1>
<p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:${C.ink};">${e(layout.intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.panel};border-radius:8px;"><tr><td style="padding:14px 18px;"><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 12px;"><tr><td style="border-radius:8px;background:${C.primary};"><a href="${e(layout.button.href)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">${e(layout.button.label)}</a></td></tr></table>
<p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:${C.muted};">Or paste this into your browser:<br><a href="${e(layout.button.href)}" style="color:${C.primary};word-break:break-all;">${e(layout.button.href)}</a></p>
<p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:${C.ink};"><strong>${e(layout.secondary.label)}</strong><br><a href="${e(layout.secondary.href)}" style="color:${C.primary};word-break:break-all;">${e(layout.secondary.href)}</a></p>
${layout.notes.map((note) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:${C.muted};">${e(note)}</p>`).join("\n")}
</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid ${C.line};font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">
<p style="margin:0 0 8px;">${e(why)}</p>
<p style="margin:0;"><a href="${e(privacy)}" style="color:${C.muted};">Privacy</a></p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  const text = [
    layout.heading, "", layout.intro, "",
    ...layout.rows.map((row) => `${row.label}: ${row.value}${row.href ? ` (${row.href})` : ""}`),
    "", `${layout.button.label}:`, layout.button.href,
    "", `${layout.secondary.label}:`, layout.secondary.href,
    "", ...layout.notes,
    "", why, `Privacy: ${privacy}`, "",
  ].join("\n");

  return { subject: layout.subject, html, text };
}

/** Sent to a host who asked for their links when creating an event. */
export function renderHostLinksEmail(input: {
  origin: string;
  event: Pick<EmailEvent, "id" | "name" | "event_date">;
  adminToken: string;
  hasPassword: boolean;
}): RenderedEmail {
  const { origin, event } = input;
  const name = oneLine(event.name);
  return render({
    origin,
    subject: `Your links for ${name}`,
    eyebrow: "Event created",
    heading: `${name} is ready to share`,
    intro: "Here are the two links for your event. Send the guest link to the people you’re inviting, and keep the admin link to yourself.",
    rows: [
      { label: "Event", value: name },
      { label: "Date", value: formatDate(event.event_date) },
    ],
    button: { label: "Open event dashboard", href: `${origin}/admin/${event.id}?token=${encodeURIComponent(input.adminToken)}` },
    secondary: { label: "Guest link to share", href: `${origin}/event/${event.id}` },
    notes: [
      // The password is deliberately not in this email.
      ...(input.hasPassword ? ["Guests will need the password you set. It isn’t included in this email."] : []),
      "Anyone with the dashboard link can edit the event and see every reply, so don’t forward this email.",
    ],
  });
}

function calendarEvent(origin: string, event: EmailEvent): CalendarEvent {
  // No description: it can be long, and a host may not want it travelling by
  // email. The link back to the event page carries the detail.
  return { ...event, url: `${origin}/event/${event.id}` };
}

/** Sent to a guest who asked for a confirmation when they replied. */
export function renderRsvpEmail(input: {
  origin: string;
  event: EmailEvent;
  rsvp: { id: string; manage_code: string; guest_name: string; adults: number; kids: number };
  bringing: string[];
  hour12: boolean;
}): RenderedEmail {
  const { origin, event, rsvp } = input;
  const name = oneLine(event.name);
  const link = isSafeHttpUrl(event.location_url) ? event.location_url : undefined;

  const rows: Row[] = [{ label: "When", value: formatWhen(event, input.hour12) }];
  if (event.location) rows.push({ label: "Where", value: oneLine(event.location), href: link });
  else if (link) rows.push({ label: "Where", value: new URL(link).host, href: link });
  rows.push({ label: "Guests", value: `${plural(rsvp.adults, "adult")}${rsvp.kids > 0 ? `, ${plural(rsvp.kids, "kid")}` : ""}` });
  if (input.bringing.length > 0) rows.push({ label: "Bringing", value: input.bringing.map(oneLine).join(", ") });

  return render({
    origin,
    subject: `You’re going to ${name}`,
    eyebrow: "Reply saved",
    heading: `You’re going to ${name}`,
    intro: `Thanks, ${oneLine(rsvp.guest_name)}. Your host has your reply.`,
    rows,
    button: { label: "View or change my RSVP", href: `${origin}/event/${event.id}#manage=${rsvp.id}.${rsvp.manage_code}` },
    secondary: { label: "Add to Google Calendar", href: googleCalendarUrl(calendarEvent(origin, event)) },
    notes: [
      "A calendar file is attached for Apple Calendar, Outlook and other apps.",
      "The RSVP link lets anyone change your reply, so keep this email to yourself.",
    ],
  });
}

/** The event as a base64 .ics file, for the RSVP confirmation. */
export function rsvpCalendarAttachment(origin: string, event: EmailEvent): EmailAttachment {
  let binary = "";
  for (const byte of new TextEncoder().encode(buildIcs(calendarEvent(origin, event)))) binary += String.fromCharCode(byte);
  return { filename: icsFilename(event.name), content: btoa(binary), content_type: "text/calendar" };
}
```

- [ ] **Step 5: Run the tests and the server typecheck**

Run: `npx vitest run -c vitest.api.config.ts test/api/email-templates.test.ts`
Expected: PASS, 7 tests.

Run: `npx tsc -p tsconfig.server.json`
Expected: no errors. `src/lib/ics.ts` and `src/lib/url.ts` are now checked in strict mode without DOM types for the first time; if either reports an error, fix it minimally in place without changing behaviour, then re-run `npx vitest run src/lib/ics.test.ts src/lib/url.test.ts`.

### Task S4: wire email into the API

**Files:**
- Create: `server/email/deliver.ts`
- Modify: `functions/api/[[route]].ts`
- Test: `test/api/email-api.test.ts`

**Interfaces:**
- Consumes: everything produced by S1–S3.
- Produces (the contract stream A codes against):
  - `GET /api/config` → `{ emailEnabled: boolean, turnstileSiteKey: string | null }`
  - `POST /api/create` accepts optional `email: string`, `turnstile_token: string`. Response gains `email: "sent" | "failed" | "limited"` only when an email was requested.
  - `POST /api/rsvp` accepts optional `email: string`, `turnstile_token: string`, `hour12: boolean`. Same `email` field in the response.
  - Errors: 400 `"Email is not available"`, 400 `"Enter a valid email address"`, 403 `"Verification failed. Please try again."`

- [ ] **Step 1: Write the failing test**

`test/api/email-api.test.ts`:

```ts
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../../functions/api/[[route]]";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const EMAIL_ENV = {
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "Simple Events <events@test.example>",
  TURNSTILE_SITE_KEY: "site-key",
  TURNSTILE_SECRET_KEY: "secret-key",
};

async function call(method: string, path: string, body?: unknown, extraEnv: Record<string, string> = EMAIL_ENV) {
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

  it("rejects an email before creating anything when email is off, malformed, or the bot check fails", async () => {
    const { sent } = stubOutbound({ turnstile: false });

    const off = await call("POST", "create", newEvent(withEmail()), {});
    expect(off.status).toBe(400);
    expect(off.body.error).toBe("Email is not available");

    const malformed = await call("POST", "create", newEvent(withEmail({ email: "not-an-address" })));
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe("Enter a valid email address");

    const bot = await call("POST", "create", newEvent(withEmail()));
    expect(bot.status).toBe(403);
    expect(bot.body.error).toBe("Verification failed. Please try again.");

    expect(await rows("events")).toHaveLength(0);
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

  it("writes no RSVP when the bot check fails", async () => {
    stubOutbound({ turnstile: false });
    const event = (await call("POST", "create", newEvent())).body;
    const res = await call("POST", "rsvp", withEmail({ event_id: event.id, guest_name: "Ada" }));
    expect(res.status).toBe(403);
    expect(await rows("rsvps")).toHaveLength(0);
  });

  it("still saves the RSVP when Resend fails", async () => {
    stubOutbound({ resendStatus: 500 });
    const event = (await call("POST", "create", newEvent())).body;
    const res = await call("POST", "rsvp", withEmail({ event_id: event.id, guest_name: "Ada" }));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("failed");
    expect(await rows("rsvps")).toHaveLength(1);
  });

  it("sends nothing for a honeypot submission", async () => {
    const { spy } = stubOutbound();
    const event = (await call("POST", "create", newEvent())).body;
    await call("POST", "rsvp", withEmail({ event_id: event.id, guest_name: "Bot", honeypot: "x" }));
    expect(spy).not.toHaveBeenCalled();
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run -c vitest.api.config.ts test/api/email-api.test.ts`
Expected: FAIL. `GET config` returns 404, and create ignores `email`.

- [ ] **Step 3: Add the delivery helper**

`server/email/deliver.ts`:

```ts
import { DEFAULT_DAILY_CAP, reserveSend } from "./limits";
import { sendEmail, type EmailAttachment } from "./resend";
import type { RenderedEmail } from "./templates";

export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  EMAIL_DAILY_CAP?: string;
}

export type EmailStatus = "sent" | "failed" | "limited";

/** Email is on only when it can both send and be protected from abuse. */
export const emailEnabled = (env: EmailEnv) =>
  Boolean(env.RESEND_API_KEY && env.EMAIL_FROM && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);

function dailyCap(env: EmailEnv): number {
  const cap = env.EMAIL_DAILY_CAP ? Number(env.EMAIL_DAILY_CAP) : NaN;
  return Number.isInteger(cap) && cap >= 0 ? cap : DEFAULT_DAILY_CAP;
}

/**
 * Reserve a send slot and send one email. Never throws: the event or RSVP is
 * already saved by the time this runs, so the caller only reports the outcome.
 * Call only when `emailEnabled(env)`.
 */
export async function deliverEmail(
  env: EmailEnv, db: D1Database, eventId: string, to: string, email: RenderedEmail, attachments?: EmailAttachment[],
): Promise<EmailStatus> {
  try {
    const sendId = await reserveSend(db, env.RESEND_API_KEY!, to, eventId, dailyCap(env));
    if (!sendId) return "limited";
    const ok = await sendEmail(env.RESEND_API_KEY!, `simple-events/${sendId}`, {
      from: env.EMAIL_FROM!, to: [to], ...email, ...(attachments ? { attachments } : {}),
    });
    return ok ? "sent" : "failed";
  } catch (e) {
    // Only D1 can throw here, and its errors carry the SQL, not the address.
    console.error("Email reservation error:", e);
    return "failed";
  }
}
```

- [ ] **Step 4: Wire the routes**

All edits are in `functions/api/[[route]].ts`.

Add to the imports at the top:

```ts
import { deliverEmail, emailEnabled, type EmailEnv } from "../../server/email/deliver";
import { normalizeEmail } from "../../server/email/limits";
import { renderHostLinksEmail, renderRsvpEmail, rsvpCalendarAttachment, type EmailEvent } from "../../server/email/templates";
import { verifyTurnstile } from "../../server/turnstile";
```

Change the `Env` interface to extend `EmailEnv`:

```ts
interface Env extends EmailEnv {
  DB: D1Database;
  R2: R2Bucket;
  R2_PUBLIC_URL?: string;
}
```

Add this helper directly above the `// ---- Bring list.` comment:

```ts
// ---- Optional email.

/**
 * The address to email, if the request asked for one. Checked in full (the
 * feature is on, the address is plain, the bot check passes) before the caller
 * writes anything, so a rejected request leaves no half-made event or RSVP.
 */
async function readEmailRequest(env: Env, request: Request, body: Record<string, unknown>): Promise<string | undefined> {
  const raw = optString(body.email, "email", 320)?.trim();
  if (!raw) return undefined;
  if (!emailEnabled(env)) throw new HttpError("Email is not available");
  const email = normalizeEmail(raw);
  if (!email) throw new HttpError("Enter a valid email address");
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, body.turnstile_token, request.headers.get("CF-Connecting-IP")))) {
    throw new HttpError("Verification failed. Please try again.", 403);
  }
  return email;
}
```

Add the config route as the first route inside the `try`, above `// POST /api/upload`:

```ts
    // GET /api/config - Which optional features this deployment has switched on
    if (request.method === "GET" && path === "config") {
      const enabled = emailEnabled(env);
      return json({ emailEnabled: enabled, turnstileSiteKey: enabled ? env.TURNSTILE_SITE_KEY : null });
    }
```

In the `create` route, add one line after `const bringItems = optList(body.bring_items, "bring_items", MAX_BRING_ITEMS);`:

```ts
      const email = await readEmailRequest(env, request, body);
```

and replace its final `return json({ id, admin_token });` with:

```ts
      if (!email) return json({ id, admin_token });
      // The event exists now, so email is best effort from here on.
      const status = await deliverEmail(env, db, id, email, renderHostLinksEmail({
        origin: url.origin, event: { id, name, event_date }, adminToken: admin_token, hasPassword: password_hash !== null,
      }));
      return json({ id, admin_token, email: status });
```

In the `rsvp` route, add one line after `const customItems = listOpen ? parseCustomItems(body.custom_items, event.bring_list_mode) : [];`:

```ts
      const email = await readEmailRequest(env, request, body);
```

and replace its last three lines (from `const results = await db.batch(statements);` to the `return`) with:

```ts
      const results = await db.batch(statements);
      const row = await db.prepare("SELECT * FROM rsvps WHERE id = ?").bind(id).first();
      const reserved = readReserved(results);
      if (!email) return json({ ...normalizeRsvp(row), reserved });

      const details = await db.prepare(
        "SELECT id, name, event_date, event_time, event_end_time, timezone, location, location_url FROM events WHERE id = ?"
      ).bind(event.id).first<EmailEvent>();
      const status = details
        ? await deliverEmail(env, db, event.id, email, renderRsvpEmail({
            origin: url.origin,
            event: details,
            rsvp: { id, manage_code, guest_name: guestName, adults, kids },
            bringing: reserved.map((r) => (r.quantity > 1 ? `${r.item_name} ×${r.quantity}` : r.item_name)),
            // The guest's own clock preference, sent by the page they replied from.
            hour12: body.hour12 === true,
          }), [rsvpCalendarAttachment(url.origin, details)])
        : "failed";
      return json({ ...normalizeRsvp(row), reserved, email: status });
```

- [ ] **Step 5: Run every API test, the typecheck and lint**

Run: `npm run test:api`
Expected: PASS, including every pre-existing test in `test/api/api.test.ts`.

Run: `npx tsc -p tsconfig.server.json`
Expected: no errors.

Run: `npx eslint functions server cleanup-worker test`
Expected: no errors.

---

## Stream A: client email flow

### Task A1: API client, Turnstile loader and the shared email field

**Files:**
- Modify: `src/lib/api.ts`
- Create: `src/lib/email.ts`, `src/lib/turnstile.ts`, `src/hooks/use-email-config.ts`, `src/components/EmailField.tsx`
- Test: `src/components/EmailField.test.tsx`

**Interfaces:**
- Consumes: `GET /api/config` → `{ emailEnabled: boolean, turnstileSiteKey: string | null }`.
- Produces:
  - `api.ts`: `type EmailStatus = "sent" | "failed" | "limited"`; `interface AppConfig { emailEnabled: boolean; turnstileSiteKey: string | null }`; `const NO_EMAIL: AppConfig`; `getConfig(): Promise<AppConfig>` (never rejects)
  - `email.ts`: `isValidEmail(value: string): boolean`; `interface EmailNotice { address: string; status: EmailStatus }`
  - `turnstile.ts`: `loadTurnstile(): Promise<TurnstileApi>`
  - `use-email-config.ts`: `useEmailConfig(): AppConfig`
  - `EmailField.tsx`: default export component with props `{ id: string; label: string; hint: string; value: string; onChange(value: string): void; siteKey: string; error?: string }` and a ref of type `EmailFieldHandle { getToken(): Promise<string>; reset(): void }`

- [ ] **Step 1: Extend `src/lib/api.ts`**

Add below the `apiFetch` function:

```ts
export type EmailStatus = "sent" | "failed" | "limited";

export interface AppConfig {
  emailEnabled: boolean;
  turnstileSiteKey: string | null;
}

export const NO_EMAIL: AppConfig = { emailEnabled: false, turnstileSiteKey: null };

let configPromise: Promise<AppConfig> | undefined;

/**
 * Which optional features this deployment has switched on. Fetched once per
 * page load. Any failure means "email is off", never an error, because the
 * email fields are an extra and the forms work without them.
 */
export function getConfig(): Promise<AppConfig> {
  configPromise ??= apiFetch("config")
    .then((config): AppConfig =>
      config.emailEnabled === true && typeof config.turnstileSiteKey === "string"
        ? { emailEnabled: true, turnstileSiteKey: config.turnstileSiteKey }
        : NO_EMAIL)
    .catch(() => NO_EMAIL);
  return configPromise;
}
```

In `createEvent`'s params type, add after `bring_list_mode?: "signup" | "open";`:

```ts
  /** Optional: where to send the links. Used once by the server, never stored. */
  email?: string;
  turnstile_token?: string;
```

In `submitRsvp`, add to the params type after `honeypot?: string;`:

```ts
  /** Optional: where to send the confirmation. Used once by the server, never stored. */
  email?: string;
  turnstile_token?: string;
  /** The guest's clock preference, so the email shows times the way the page did. */
  hour12?: boolean;
```

and change its return type to:

```ts
Promise<{ id: string; manage_code: string; reserved?: ReservedItem[]; email?: EmailStatus }>
```

- [ ] **Step 2: Add the small helpers**

`src/lib/email.ts`:

```ts
import type { EmailStatus } from "./api";

/** A quick shape check before submitting. The server applies the real rule. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** What to tell someone about the email they asked for. */
export interface EmailNotice {
  address: string;
  status: EmailStatus;
}
```

`src/lib/turnstile.ts`:

```ts
// Loader for Cloudflare Turnstile, the bot check that guards the optional
// email fields. The script is third party, so it is only fetched once someone
// actually types an email address.

export interface TurnstileOptions {
  sitekey: string;
  /** Stay invisible unless Cloudflare decides it needs a click. */
  appearance: "interaction-only";
  callback(token: string): void;
  "expired-callback"(): void;
  "error-callback"(): void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    simpleEventsTurnstileLoaded?: () => void;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=simpleEventsTurnstileLoaded";
const LOAD_TIMEOUT_MS = 15_000;

let pending: Promise<TurnstileApi> | undefined;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (pending) return pending;
  if (window.turnstile) return Promise.resolve(window.turnstile);
  pending = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error("Verification could not be loaded."));
    };
    const timeout = window.setTimeout(fail, LOAD_TIMEOUT_MS);
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = fail;
    window.simpleEventsTurnstileLoaded = () => {
      if (!window.turnstile) return fail();
      window.clearTimeout(timeout);
      resolve(window.turnstile);
    };
    document.head.appendChild(script);
  }).catch((error) => {
    // Forget a failed load so a later attempt can try again.
    pending = undefined;
    throw error;
  });
  return pending;
}
```

`src/hooks/use-email-config.ts`:

```ts
import { useEffect, useState } from "react";
import { getConfig, NO_EMAIL, type AppConfig } from "@/lib/api";

/** Whether this deployment can send email. Off until the server says otherwise. */
export function useEmailConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(NO_EMAIL);
  useEffect(() => {
    let active = true;
    getConfig().then((loaded) => {
      if (active) setConfig(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return config;
}
```

- [ ] **Step 3: Write the failing test**

`src/components/EmailField.test.tsx`:

```tsx
import { createRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import EmailField, { type EmailFieldHandle } from "./EmailField";

const turnstile = vi.hoisted(() => ({ loadTurnstile: vi.fn() }));
vi.mock("@/lib/turnstile", () => turnstile);

/** A stand-in Turnstile that hands out tok-1, tok-2, ... on render and on reset. */
function fakeTurnstile() {
  let issued = 0;
  let callback: (token: string) => void = () => {};
  const api = {
    render: vi.fn((_el: HTMLElement, options: { callback(token: string): void }) => {
      callback = options.callback;
      callback(`tok-${++issued}`);
      return "widget-1";
    }),
    reset: vi.fn(() => callback(`tok-${++issued}`)),
    remove: vi.fn(),
  };
  return api;
}

function Harness({ handle }: { handle: React.RefObject<EmailFieldHandle> }) {
  const [value, setValue] = useState("");
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <EmailField ref={handle} id="email" label="Email me the links" hint="Used once. Not stored." value={value} onChange={setValue} siteKey="site-key" />
    </MemoryRouter>
  );
}

const type = (value: string) => fireEvent.change(screen.getByLabelText(/Email me the links/), { target: { value } });

describe("EmailField", () => {
  beforeEach(() => turnstile.loadTurnstile.mockReset());

  it("explains itself, links to the privacy notice, and loads nothing while empty", () => {
    render(<Harness handle={createRef()} />);
    expect(screen.getByText(/Used once\. Not stored\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(turnstile.loadTurnstile).not.toHaveBeenCalled();
  });

  it("starts the bot check once an address is typed and hands out its token", async () => {
    const api = fakeTurnstile();
    turnstile.loadTurnstile.mockResolvedValue(api);
    const handle = createRef<EmailFieldHandle>();
    render(<Harness handle={handle} />);

    await act(async () => type("ada@example.com"));
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.render.mock.calls[0][1]).toMatchObject({ sitekey: "site-key", appearance: "interaction-only" });
    await expect(handle.current!.getToken()).resolves.toBe("tok-1");
  });

  it("gives a fresh token after reset, because tokens are single use", async () => {
    const api = fakeTurnstile();
    turnstile.loadTurnstile.mockResolvedValue(api);
    const handle = createRef<EmailFieldHandle>();
    render(<Harness handle={handle} />);

    await act(async () => type("ada@example.com"));
    await handle.current!.getToken();
    act(() => handle.current!.reset());
    expect(api.reset).toHaveBeenCalledWith("widget-1");
    await expect(handle.current!.getToken()).resolves.toBe("tok-2");
  });

  it("waits for a token that has not arrived yet", async () => {
    let deliver: (token: string) => void = () => {};
    turnstile.loadTurnstile.mockResolvedValue({
      render: vi.fn((_el: HTMLElement, options: { callback(token: string): void }) => {
        deliver = options.callback;
        return "widget-1";
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    });
    const handle = createRef<EmailFieldHandle>();
    render(<Harness handle={handle} />);

    await act(async () => type("ada@example.com"));
    const waiting = handle.current!.getToken();
    act(() => deliver("late-token"));
    await expect(waiting).resolves.toBe("late-token");
  });

  it("says email isn't available when the bot check can't load, and removes the widget when cleared", async () => {
    turnstile.loadTurnstile.mockRejectedValue(new Error("blocked"));
    const handle = createRef<EmailFieldHandle>();
    render(<Harness handle={handle} />);

    await act(async () => type("ada@example.com"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/can’t send email right now/);
    await expect(handle.current!.getToken()).rejects.toThrow(/can’t send email right now/);

    await act(async () => type(""));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `npx vitest run src/components/EmailField.test.tsx`
Expected: FAIL, cannot resolve `./EmailField`.

- [ ] **Step 5: Implement the field**

`src/components/EmailField.tsx`:

```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadTurnstile, type TurnstileApi } from "@/lib/turnstile";

export interface EmailFieldHandle {
  /** A bot-check token for this submit, waiting for the check if it is still running. */
  getToken(): Promise<string>;
  /** Tokens are single use: call this after any request that carried one and failed. */
  reset(): void;
}

interface EmailFieldProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  siteKey: string;
  error?: string;
}

const UNAVAILABLE = "We can’t send email right now. Clear this field to continue without it.";
const TOKEN_WAIT_MS = 15_000;

interface Waiter {
  resolve(token: string): void;
  reject(error: Error): void;
}

/**
 * An optional email address plus the invisible bot check that has to pass
 * before the server will send to it. The check only loads once something has
 * been typed, so people who skip the field never touch a third-party script.
 */
const EmailField = forwardRef<EmailFieldHandle, EmailFieldProps>(
  ({ id, label, hint, value, onChange, siteKey, error }, ref) => {
    const container = useRef<HTMLDivElement>(null);
    const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
    const token = useRef<string | null>(null);
    const waiter = useRef<Waiter | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const active = value.trim() !== "";

    useEffect(() => {
      if (!active) return;
      let live = true;
      const fail = () => {
        if (!live) return;
        token.current = null;
        setUnavailable(true);
        waiter.current?.reject(new Error(UNAVAILABLE));
        waiter.current = null;
      };
      loadTurnstile()
        .then((api) => {
          if (!live || !container.current) return;
          const widgetId = api.render(container.current, {
            sitekey: siteKey,
            appearance: "interaction-only",
            callback: (issued) => {
              if (!live) return;
              setUnavailable(false);
              if (waiter.current) {
                waiter.current.resolve(issued);
                waiter.current = null;
              } else {
                token.current = issued;
              }
            },
            // Turnstile refreshes an expired token itself and calls back again.
            "expired-callback": () => {
              token.current = null;
            },
            "error-callback": fail,
          });
          if (widgetId === undefined) fail();
          else widget.current = { api, id: widgetId };
        })
        .catch(fail);
      return () => {
        live = false;
        token.current = null;
        setUnavailable(false);
        if (widget.current) {
          widget.current.api.remove(widget.current.id);
          widget.current = null;
        }
      };
    }, [active, siteKey]);

    useImperativeHandle(ref, () => ({
      getToken() {
        if (token.current) {
          const issued = token.current;
          token.current = null;
          return Promise.resolve(issued);
        }
        if (unavailable) return Promise.reject(new Error(UNAVAILABLE));
        return new Promise<string>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            waiter.current = null;
            reject(new Error(UNAVAILABLE));
          }, TOKEN_WAIT_MS);
          waiter.current = {
            resolve: (issued) => {
              window.clearTimeout(timer);
              resolve(issued);
            },
            reject: (reason) => {
              window.clearTimeout(timer);
              reject(reason);
            },
          };
        });
      },
      reset() {
        token.current = null;
        if (!widget.current) return;
        try {
          widget.current.api.reset(widget.current.id);
        } catch {
          setUnavailable(true);
        }
      },
    }), [unavailable]);

    const message = error ?? (active && unavailable ? UNAVAILABLE : undefined);

    return (
      <div>
        <Label htmlFor={id}>
          {label} <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id={id}
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          placeholder="you@example.com"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1.5"
          aria-invalid={!!message}
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-5 text-muted-foreground">
          {hint}{" "}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy</Link>
        </p>
        {message && <p className="field-error" role="alert">{message}</p>}
        <div ref={container} />
      </div>
    );
  },
);
EmailField.displayName = "EmailField";

export default EmailField;
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npx vitest run src/components/EmailField.test.tsx`
Expected: PASS, 5 tests.

### Task A2: the host's email on the create flow

**Files:**
- Modify: `src/pages/CreateEvent.tsx`, `src/pages/EventCreated.tsx`
- Test: `src/pages/CreateEvent.email.test.tsx`, `src/pages/EventCreated.test.tsx`

**Interfaces:**
- Consumes: `EmailField`, `EmailFieldHandle`, `useEmailConfig`, `isValidEmail`, `EmailNotice` (A1); `createEvent` response field `email?: EmailStatus`.
- Produces: `/created` router state `{ password?: string; embed?: boolean; email?: EmailNotice }`.

- [ ] **Step 1: Write the failing tests**

`src/pages/CreateEvent.email.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";

import CreateEvent from "./CreateEvent";

const api = vi.hoisted(() => ({ getConfig: vi.fn(), createEvent: vi.fn() }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api")>("@/lib/api")),
  ...api,
}));

const turnstile = vi.hoisted(() => ({ loadTurnstile: vi.fn() }));
vi.mock("@/lib/turnstile", () => turnstile);

const Created = () => <pre data-testid="created-state">{JSON.stringify(useLocation().state)}</pre>;

const renderCreate = () =>
  render(
    <MemoryRouter initialEntries={["/create"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/create" element={<CreateEvent />} />
        <Route path="/created" element={<Created />} />
      </Routes>
    </MemoryRouter>,
  );

const fillRequired = () => {
  fireEvent.change(screen.getByLabelText(/Event name/), { target: { value: "Park picnic" } });
  fireEvent.change(screen.getByLabelText(/Date/), { target: { value: "2030-06-01" } });
};

describe("CreateEvent email", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    localStorage.clear();
    let issued = 0;
    turnstile.loadTurnstile.mockReset().mockResolvedValue({
      render: (_el: HTMLElement, options: { callback(token: string): void }) => {
        options.callback(`tok-${++issued}`);
        return "widget-1";
      },
      reset: vi.fn(),
      remove: vi.fn(),
    });
    api.getConfig.mockResolvedValue({ emailEnabled: true, turnstileSiteKey: "site-key" });
    api.createEvent.mockResolvedValue({ id: "e1", admin_token: "t1", email: "sent" });
  });

  it("has no email field when the deployment can't send email", async () => {
    api.getConfig.mockResolvedValue({ emailEnabled: false, turnstileSiteKey: null });
    renderCreate();
    await waitFor(() => expect(api.getConfig).toHaveBeenCalled());
    expect(screen.queryByLabelText(/Email me the links/)).not.toBeInTheDocument();

    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    await screen.findByTestId("created-state");
    expect(api.createEvent.mock.calls[0][0]).toMatchObject({ email: undefined, turnstile_token: undefined });
  });

  it("sends the address with a bot-check token and passes the outcome on", async () => {
    renderCreate();
    fireEvent.change(await screen.findByLabelText(/Email me the links/), { target: { value: " ada@example.com " } });
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    const state = await screen.findByTestId("created-state");
    expect(api.createEvent.mock.calls[0][0]).toMatchObject({ email: "ada@example.com", turnstile_token: "tok-1" });
    expect(JSON.parse(state.textContent!)).toEqual({ email: { address: "ada@example.com", status: "sent" } });
  });

  it("stops a malformed address before anything is sent", async () => {
    renderCreate();
    fireEvent.change(await screen.findByLabelText(/Email me the links/), { target: { value: "not-an-address" } });
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(api.createEvent).not.toHaveBeenCalled();
  });

  it("lets the host try again after a failed request", async () => {
    api.createEvent.mockRejectedValueOnce(new Error("Verification failed. Please try again."));
    renderCreate();
    fireEvent.change(await screen.findByLabelText(/Email me the links/), { target: { value: "ada@example.com" } });
    fillRequired();

    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    await waitFor(() => expect(api.createEvent).toHaveBeenCalledTimes(1));
    const retry = await screen.findByRole("button", { name: "Create event" });
    await waitFor(() => expect(retry).toBeEnabled());
  });
});
```

`src/pages/EventCreated.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import EventCreated from "./EventCreated";

const renderCreated = (state: unknown) =>
  render(
    <MemoryRouter
      initialEntries={[{ pathname: "/created", search: "?id=e1&token=t1", state }]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <EventCreated />
    </MemoryRouter>,
  );

describe("EventCreated email notice", () => {
  it("confirms where the links were emailed", () => {
    renderCreated({ email: { address: "ada@example.com", status: "sent" } });
    expect(screen.getByRole("status")).toHaveTextContent("We’ve emailed these links to ada@example.com.");
  });

  it("says so plainly when the email could not be sent", () => {
    for (const status of ["failed", "limited"]) {
      const { unmount } = renderCreated({ email: { address: "ada@example.com", status } });
      expect(screen.getByRole("status")).toHaveTextContent("We couldn’t send the email. Copy the links below instead.");
      unmount();
    }
  });

  it("shows nothing about email when none was requested", () => {
    renderCreated(null);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/pages/CreateEvent.email.test.tsx src/pages/EventCreated.test.tsx`
Expected: FAIL. No email field, no status element.

- [ ] **Step 3: Implement `CreateEvent.tsx`**

Change the first import to `import { useRef, useState } from "react";` and add these imports:

```tsx
import EmailField, { type EmailFieldHandle } from "@/components/EmailField";
import { useEmailConfig } from "@/hooks/use-email-config";
import { isValidEmail } from "@/lib/email";
```

Add this state after `const [accessOpen, setAccessOpen] = useState(false);`:

```tsx
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const emailRef = useRef<EmailFieldHandle>(null);
  const { emailEnabled, turnstileSiteKey } = useEmailConfig();
```

In `onSubmit`, insert between the password check's closing `}` and `setIsSubmitting(true);`:

```tsx
    const hostEmail = emailEnabled ? email.trim() : "";
    if (hostEmail && !isValidEmail(hostEmail)) {
      setEmailError("Enter a valid email address, or leave it empty.");
      window.setTimeout(() => document.getElementById("host-email")?.focus(), 0);
      return;
    }
```

Make the first statement inside the `try` (above the banner comment):

```tsx
      // First, so a failed bot check doesn't leave an uploaded banner behind.
      const turnstile_token = hostEmail ? await emailRef.current?.getToken() : undefined;
```

Add two properties at the end of the `createEvent({ ... })` argument, after `bring_list_mode`:

```tsx
        email: hostEmail || undefined,
        turnstile_token,
```

Replace the `navigate(...)` call with:

```tsx
      navigate(`/created?${createdParams.toString()}`, {
        state: {
          ...(password ? { password, embed: embedPassword } : {}),
          ...(hostEmail && result.email ? { email: { address: hostEmail, status: result.email } } : {}),
        },
      });
```

Make the first line of the `catch` block:

```tsx
      // A bot-check token only works once, so get a new one for the retry.
      emailRef.current?.reset();
```

In the JSX, add after the closing `</div>` of the "A note for guests" block (the last child of the `space-y-6` div in section 01):

```tsx
              {emailEnabled && turnstileSiteKey && (
                <EmailField
                  ref={emailRef}
                  id="host-email"
                  label="Email me the links"
                  hint="Used once to send your guest and admin links. Not stored."
                  value={email}
                  onChange={(value) => { setEmail(value); setEmailError(undefined); }}
                  siteKey={turnstileSiteKey}
                  error={emailError}
                />
              )}
```

- [ ] **Step 4: Implement `EventCreated.tsx`**

Add the import:

```tsx
import type { EmailNotice } from "@/lib/email";
```

Change the router-state line to:

```tsx
  const { password, embed, email } = (useLocation().state ?? {}) as { password?: string; embed?: boolean; email?: EmailNotice };
```

Inside `<header>`, add after the closing `</p>` of the "Send the guest link now…" paragraph:

```tsx
          {email && (
            <p role="status" className="mt-5 max-w-xl rounded-md border border-border bg-muted/45 px-4 py-3 text-sm leading-6">
              {email.status === "sent"
                ? <>We’ve emailed these links to <span className="font-medium">{email.address}</span>.</>
                : "We couldn’t send the email. Copy the links below instead."}
            </p>
          )}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/pages/CreateEvent.email.test.tsx src/pages/EventCreated.test.tsx src/pages/CreateEvent.test.tsx`
Expected: PASS, including the two pre-existing `CreateEvent.test.tsx` tests.

### Task A3: the guest's email on the RSVP flow

**Files:**
- Modify: `src/pages/EventPage.tsx`, `src/components/RsvpSuccessScreen.tsx`, `src/pages/EventPage.test.tsx`

**Interfaces:**
- Consumes: A1's exports; `submitRsvp` response field `email?: EmailStatus`.
- Produces: `RsvpSuccessScreen` prop `emailNotice?: EmailNotice | null`.

- [ ] **Step 1: Write the failing tests**

In `src/pages/EventPage.test.tsx`:

Add `waitFor` to the `@testing-library/react` import. Add `getConfig: vi.fn(),` to the hoisted `api` object. Add below the `vi.mock("@/lib/api", ...)` block:

```tsx
const turnstile = vi.hoisted(() => ({ loadTurnstile: vi.fn() }));
vi.mock("@/lib/turnstile", () => turnstile);
```

Add to the end of the existing `beforeEach` (after the `mockReset` loop, so the defaults survive it):

```tsx
    api.getConfig.mockResolvedValue({ emailEnabled: false, turnstileSiteKey: null });
    let issued = 0;
    turnstile.loadTurnstile.mockReset().mockResolvedValue({
      render: (_el: HTMLElement, options: { callback(token: string): void }) => {
        options.callback(`tok-${++issued}`);
        return "widget-1";
      },
      reset: vi.fn(),
      remove: vi.fn(),
    });
```

Add these tests inside the `describe("EventPage", ...)` block:

```tsx
  it("has no email field when the deployment can't send email", async () => {
    api.getEvent.mockResolvedValue(eventData);
    renderEvent();
    await screen.findByLabelText(/Your name/);
    expect(screen.queryByLabelText(/Email me a confirmation/)).not.toBeInTheDocument();
  });

  it("sends the guest's address with a bot-check token and confirms where it went", async () => {
    api.getConfig.mockResolvedValue({ emailEnabled: true, turnstileSiteKey: "site-key" });
    api.getEvent.mockResolvedValue(eventData);
    api.submitRsvp.mockResolvedValue({ id: "r1", manage_code: "c1", reserved: [], email: "sent" });
    renderEvent();

    fireEvent.change(await screen.findByLabelText(/Your name/), { target: { value: "Ada" } });
    fireEvent.change(await screen.findByLabelText(/Email me a confirmation/), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));

    expect(await screen.findByRole("status")).toHaveTextContent("We’ve emailed your confirmation to ada@example.com.");
    expect(api.submitRsvp.mock.calls[0][0]).toMatchObject({
      guest_name: "Ada", email: "ada@example.com", turnstile_token: "tok-1", hour12: expect.any(Boolean),
    });
  });

  it("tells the guest when the confirmation could not be sent", async () => {
    api.getConfig.mockResolvedValue({ emailEnabled: true, turnstileSiteKey: "site-key" });
    api.getEvent.mockResolvedValue(eventData);
    api.submitRsvp.mockResolvedValue({ id: "r1", manage_code: "c1", reserved: [], email: "limited" });
    renderEvent();

    fireEvent.change(await screen.findByLabelText(/Your name/), { target: { value: "Ada" } });
    fireEvent.change(await screen.findByLabelText(/Email me a confirmation/), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));

    expect(await screen.findByRole("status")).toHaveTextContent("We couldn’t send the email. Save the link below instead.");
  });

  it("stops a malformed address, and lets the guest retry after a failed request", async () => {
    api.getConfig.mockResolvedValue({ emailEnabled: true, turnstileSiteKey: "site-key" });
    api.getEvent.mockResolvedValue(eventData);
    api.submitRsvp
      .mockRejectedValueOnce(new ApiError("Verification failed. Please try again.", 403))
      .mockResolvedValue({ id: "r1", manage_code: "c1", reserved: [], email: "sent" });
    renderEvent();

    fireEvent.change(await screen.findByLabelText(/Your name/), { target: { value: "Ada" } });
    const email = await screen.findByLabelText(/Email me a confirmation/);
    fireEvent.change(email, { target: { value: "not-an-address" } });
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));
    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(api.submitRsvp).not.toHaveBeenCalled();

    fireEvent.change(email, { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));
    await waitFor(() => expect(api.submitRsvp).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send RSVP" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));
    expect(await screen.findByText(/We’ve emailed your confirmation to/)).toBeInTheDocument();
    expect(api.submitRsvp).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/pages/EventPage.test.tsx`
Expected: the four new tests FAIL (no email field); the three old ones PASS.

- [ ] **Step 3: Implement `RsvpSuccessScreen.tsx`**

Add the import:

```tsx
import type { EmailNotice } from "@/lib/email";
```

Add `emailNotice?: EmailNotice | null;` to `RsvpSuccessScreenProps`, and `emailNotice,` to the destructured props.

Add after the `<p className="mt-3 text-lg text-muted-foreground">Thanks, {guestName}. Your host has your reply.</p>` line:

```tsx
        {emailNotice && (
          <p role="status" className="mt-5 rounded-md border border-border bg-muted/45 px-4 py-3 text-sm leading-6">
            {emailNotice.status === "sent"
              ? <>We’ve emailed your confirmation to <span className="font-medium">{emailNotice.address}</span>.</>
              : "We couldn’t send the email. Save the link below instead."}
          </p>
        )}
```

- [ ] **Step 4: Implement `EventPage.tsx`**

Change the React import to include `useRef`:

```tsx
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
```

Add these imports:

```tsx
import EmailField, { type EmailFieldHandle } from "@/components/EmailField";
import { useEmailConfig } from "@/hooks/use-email-config";
import { isValidEmail, type EmailNotice } from "@/lib/email";
```

Add this state after `const [updatingRsvp, setUpdatingRsvp] = useState(false);`:

```tsx
  // Optional confirmation email. The address is sent with the RSVP and is not
  // kept anywhere, on the server or in this browser.
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [emailNotice, setEmailNotice] = useState<EmailNotice | null>(null);
  const emailRef = useRef<EmailFieldHandle>(null);
  const { emailEnabled, turnstileSiteKey } = useEmailConfig();
```

In `handleRsvp`, insert between the early `return` and `setSubmittingRsvp(true);`:

```tsx
    const guestEmail = emailEnabled ? email.trim() : "";
    if (guestEmail && !isValidEmail(guestEmail)) {
      setEmailError("Enter a valid email address, or leave it empty.");
      return;
    }
```

Make the first statement inside its `try`:

```tsx
      const turnstile_token = guestEmail ? await emailRef.current?.getToken() : undefined;
```

Change the `submitRsvp` call to:

```tsx
      const result = await submitRsvp({
        event_id: id, access_token: accessToken, guest_name: guestName.trim(), adults, kids, honeypot,
        claim_items, custom_items,
        email: guestEmail || undefined, turnstile_token, hour12: use12Hour,
      });
```

Add directly before `setShowSuccessScreen(true);` in `handleRsvp`:

```tsx
      setEmailNotice(guestEmail && result.email ? { address: guestEmail, status: result.email } : null);
      setEmail("");
```

Make the first line of `handleRsvp`'s `catch` block:

```tsx
      // A bot-check token only works once, so get a new one for the retry.
      emailRef.current?.reset();
```

Pass the notice to the success screen, adding this prop to `<RsvpSuccessScreen ... />`:

```tsx
          emailNotice={emailNotice}
```

In the RSVP form JSX, add directly above the `<div className="flex gap-2">` that holds the submit button:

```tsx
                {!isEditing && emailEnabled && turnstileSiteKey && (
                  <EmailField
                    ref={emailRef}
                    id="guest_email"
                    label="Email me a confirmation"
                    hint="Used once to send your confirmation and calendar file. Not stored."
                    value={email}
                    onChange={(value) => { setEmail(value); setEmailError(undefined); }}
                    siteKey={turnstileSiteKey}
                    error={emailError}
                  />
                )}
```

- [ ] **Step 5: Run the stream's tests, typecheck and lint**

Run: `npx vitest run src/pages/EventPage.test.tsx src/pages/CreateEvent.email.test.tsx src/pages/EventCreated.test.tsx src/components/EmailField.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors in files this stream owns.

Run: `npx eslint src/lib/api.ts src/lib/email.ts src/lib/turnstile.ts src/hooks/use-email-config.ts src/components/EmailField.tsx src/components/EmailField.test.tsx src/components/RsvpSuccessScreen.tsx src/pages/CreateEvent.tsx src/pages/CreateEvent.email.test.tsx src/pages/EventCreated.tsx src/pages/EventCreated.test.tsx src/pages/EventPage.tsx src/pages/EventPage.test.tsx`
Expected: no errors.

---

## Stream B: privacy notice, headers, configuration, docs

### Task B1: the privacy page

**Files:**
- Create: `src/pages/PrivacyPage.tsx`
- Modify: `src/App.tsx`, `src/pages/LandingPage.tsx`
- Test: `src/pages/PrivacyPage.test.tsx`

**Interfaces:**
- Consumes: `RETENTION_DAYS` from `@/lib/myEvents`; `AppHeader` from `@/components/AppHeader`.
- Produces: the `/privacy` route, which stream A's `EmailField` and the server's emails link to.

- [ ] **Step 1: Write the failing test**

`src/pages/PrivacyPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import PrivacyPage from "./PrivacyPage";
import { RETENTION_DAYS } from "@/lib/myEvents";

describe("PrivacyPage", () => {
  beforeEach(() => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PrivacyPage />
      </MemoryRouter>,
    );
  });

  it("covers each topic a visitor would look for", () => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("How your details are handled");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "What we store",
      "Email addresses",
      "On your device",
      "Who can see what",
      "Services we use",
      "Never sold or used for marketing",
      "When it’s deleted",
      "Removal requests and questions",
    ]);
  });

  it("states the email promise, the retention period and the contact address", () => {
    expect(screen.getByText(/used once to send that email and is not saved/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${RETENTION_DAYS} days after the event date`))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "privacy@soderholm.app" })).toHaveAttribute("href", "mailto:privacy@soderholm.app");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/pages/PrivacyPage.test.tsx`
Expected: FAIL, cannot resolve `./PrivacyPage`.

- [ ] **Step 3: Implement the page**

`src/pages/PrivacyPage.tsx`:

```tsx
import type { ReactNode } from "react";
import AppHeader from "@/components/AppHeader";
import { RETENTION_DAYS } from "@/lib/myEvents";

const CONTACT = "privacy@soderholm.app";

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-10 border-t border-border pt-7">
    <h2 className="text-2xl">{title}</h2>
    <div className="mt-3 space-y-3 leading-7 text-muted-foreground">{children}</div>
  </section>
);

const List = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc space-y-1.5 pl-5">{children}</ul>
);

const PrivacyPage = () => (
  <main id="main-content" className="page-texture min-h-[100dvh] bg-background">
    <AppHeader backTo="/" backLabel="Home" />
    <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="eyebrow">Privacy</p>
      <h1 className="mt-3 text-4xl leading-tight tracking-[-0.025em] sm:text-5xl">How your details are handled</h1>
      <p className="mt-4 text-lg leading-8 text-muted-foreground">
        A plain-English summary of what Simple Events stores, who can see it and when it’s deleted. There are no accounts.
      </p>

      <Section title="What we store">
        <p>When a host creates an event, we store:</p>
        <List>
          <li>the event’s name, date, time, time zone, place, description and banner image</li>
          <li>the bring list, if the host adds one</li>
          <li>a scrambled (hashed) copy of the event password, if one is set</li>
          <li>the private key behind the host’s admin link</li>
        </List>
        <p>When a guest replies, we store:</p>
        <List>
          <li>the name they enter and how many adults and kids are coming</li>
          <li>what they said they would bring, and any note with it</li>
          <li>the private key behind their own edit link</li>
        </List>
        <p>We don’t store email addresses, payment details, or your IP address with an event or a reply.</p>
      </Section>

      <Section title="Email addresses">
        <p>
          Email is optional. If you enter an address to have your links or a confirmation sent to you, it is used once
          to send that email and is not saved with the event or your reply.
        </p>
        <List>
          <li>To limit how many emails can be sent to one address, we keep a scrambled fingerprint of it for up to 48 hours. It can’t be turned back into your address.</li>
          <li>Our email provider, Resend, keeps a delivery log that includes your address and the email itself for up to 30 days.</li>
          <li>We send that one email and nothing after it. There is no mailing list.</li>
        </List>
      </Section>

      <Section title="On your device">
        <p>
          Your browser keeps a few things in its own storage so you don’t lose them: the events you created and their
          admin links, the edit link for a reply you sent, and whether you have already entered an event’s password.
          This stays on your device, and clearing your browser’s site data removes it.
        </p>
      </Section>

      <Section title="Who can see what">
        <List>
          <li>The host sees every reply: names, head counts and what people are bringing.</li>
          <li>Guests see what the host allows: the full guest list, only the totals, or nothing. Names on the bring list are visible to anyone who can open the event.</li>
          <li>Nobody but you sees an email address you enter. Hosts are never shown their guests’ addresses.</li>
        </List>
        <p>Anyone who has a link can open it, so treat links like a key and only share them with the right people.</p>
      </Section>

      <Section title="Services we use">
        <List>
          <li><strong className="font-medium text-foreground">Cloudflare</strong> hosts the site, the database and banner images. If you enter an email address, it also runs a bot check (Turnstile), which looks at technical details such as your IP address and browser to tell people from bots.</li>
          <li><strong className="font-medium text-foreground">Resend</strong> delivers email. It’s only involved if you ask for one.</li>
          <li><strong className="font-medium text-foreground">Google Fonts</strong> serves the typefaces, so your browser contacts Google when a page loads.</li>
        </List>
        <p>There are no analytics, ads or trackers on this site.</p>
      </Section>

      <Section title="Never sold or used for marketing">
        <p>Your details are never sold, rented or shared for marketing. Any email we send is the one you asked for.</p>
      </Section>

      <Section title="When it’s deleted">
        <List>
          <li>Automatically, {RETENTION_DAYS} days after the event date: the event, every reply, the bring list and the banner.</li>
          <li>Straight away, if the host deletes the event from its dashboard.</li>
          <li>A guest can cancel their reply from their edit link, and a host can remove any reply.</li>
        </List>
        <p>Cloudflare’s database recovery backups may still hold deleted data for up to 30 days before it’s gone for good.</p>
      </Section>

      <Section title="Removal requests and questions">
        <p>
          If you’re on a guest list and want your details removed, use your edit link, ask the host, or email{" "}
          <a className="font-medium text-foreground underline underline-offset-2" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          Questions about this notice go to the same address.
        </p>
      </Section>

      <p className="mt-12 text-sm text-muted-foreground">
        Last updated 10 October 2026. This is a plain-language notice, not legal advice.
      </p>
    </article>
  </main>
);

export default PrivacyPage;
```

Before finishing this step, verify three claims in the page against the code and correct the page text (not the code) if any is wrong:
1. `grep -n "fonts.googleapis\|fonts.gstatic" index.html src/index.css` — if neither file loads Google Fonts, delete the Google Fonts list item.
2. `grep -rn "safeStorage.set\|localStorage.setItem" src --include=*.ts --include=*.tsx | grep -v test` — the "On your device" paragraph must list what is actually stored.
3. `grep -n "guest_name" "functions/api/[[route]].ts" | head -20` and read `getBringItems` — confirm bring-list commitments include `guest_name` regardless of `guest_visibility`. If they do not, change that sentence to match.

- [ ] **Step 4: Add the route and the footer link**

In `src/App.tsx`, add with the other lazy imports:

```tsx
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
```

and add above the `path="*"` route:

```tsx
          <Route path="/privacy" element={<PrivacyPage />} />
```

In `src/pages/LandingPage.tsx`, inside the footer's `<div className="flex gap-5">`, add as the first child (`Link` is already imported from `react-router-dom`):

```tsx
          <Link className="hover:text-foreground" to="/privacy">Privacy</Link>
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/pages/PrivacyPage.test.tsx`
Expected: PASS, 2 tests.

Run: `npx eslint src/pages/PrivacyPage.tsx src/pages/PrivacyPage.test.tsx src/App.tsx src/pages/LandingPage.tsx`
Expected: no errors.

### Task B2: headers, configuration and README

**Files:**
- Modify: `public/_headers`, `wrangler.toml`, `.gitignore`, `README.md`
- Create: `.dev.vars.example`

- [ ] **Step 1: Allow Turnstile in the CSP**

In `public/_headers`, in the `Content-Security-Policy` line, change `script-src 'self';` to:

```
script-src 'self' https://challenges.cloudflare.com;
```

and insert `frame-src https://challenges.cloudflare.com; ` directly before `frame-ancestors 'none';`. Change nothing else on the line.

- [ ] **Step 2: Add the variables to `wrangler.toml`**

Insert after the `pages_build_output_dir = "./dist"` line (before `[[d1_databases]]`):

```toml

# Optional email (see "Optional email" in the README). Email stays off until
# all four of EMAIL_FROM, TURNSTILE_SITE_KEY and the two secrets
# (RESEND_API_KEY, TURNSTILE_SECRET_KEY, set in the dashboard) are present.
[vars]
EMAIL_FROM = "Simple Events <events@updates.soderholm.app>"
# TURNSTILE_SITE_KEY = "0x..."   # from the Turnstile widget for this site
# EMAIL_DAILY_CAP = "80"         # overall emails per 24 hours
```

Append at the end of the file:

```toml

# Vars are not inherited by environments either.
[env.preview.vars]
EMAIL_FROM = "Simple Events <events@updates.soderholm.app>"
# TURNSTILE_SITE_KEY = "0x..."
```

- [ ] **Step 3: Local secrets template**

`.dev.vars.example`:

```
# Copy to .dev.vars for `npm run dev:edge`. Never commit .dev.vars.
#
# These are Cloudflare's public Turnstile test keys, which always pass.
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
# Email stays off locally until you add a real key here.
# RESEND_API_KEY=re_...
```

Add a line `.dev.vars` to `.gitignore`, directly under the existing `.wrangler` line.

- [ ] **Step 4: README**

Make these edits to `README.md`:

1. Under **For hosts**, add a bullet after the "Created events are remembered in the browser" bullet:

```markdown
- Optionally have the guest and admin links emailed to you. The address is used once
  and not stored
```

2. Under **For guests**, add a bullet at the end:

```markdown
- Optionally get a confirmation by email, with your edit link and a calendar file. The
  address is used once and not stored
```

3. Add a new section directly above `## Tech stack`:

```markdown
## Optional email

Hosts and guests can each ask for one email: the host's links when an event is
created, and the guest's confirmation (edit link, `.ics` attachment, Google
Calendar link) when they reply. Both fields are optional, and both are hidden
unless the deployment is configured to send (see `GET /api/config`).

- **Addresses are not stored.** The address travels with the create or RSVP
  request, is handed to Resend, and is never written to D1. The one trace kept is
  a keyed hash in `email_sends`, used for the send caps and purged after 48 hours
  by the cleanup worker. Resend keeps its own delivery log for up to 30 days. The
  notice at `/privacy` says all of this in plain English; keep it in step with the
  code.
- **One attempt, reported honestly.** The email is sent inside the request
  (`server/email/`). The response carries `email: "sent" | "failed" | "limited"`
  and the page says which. There is no retry queue, because the links are always
  on screen as well. An event or RSVP is never lost because an email failed.
- **The event password is never emailed.** The host's email links to the plain
  guest link and says a password is needed.
- **Abuse protection.** An open email field would let anyone make this domain
  send mail to any address, so a request carrying an email must pass Cloudflare
  Turnstile before anything is written, and then reserve a slot under three
  24-hour caps: 3 per address, 100 per event, and `EMAIL_DAILY_CAP` overall
  (default 80, which leaves headroom on Resend's free tier of 100 a day). Over a
  cap, the event or RSVP is saved and only the email is skipped. The Turnstile
  script is loaded only once someone types an address.
```

4. In the **Tech stack** table, add a row after `File storage`:

```markdown
| Email (optional) | Resend, guarded by Cloudflare Turnstile |
```

5. In **Running the Pages Functions locally**, add after the paragraph that starts "This runs the same runtime Cloudflare does":

```markdown
To try the email fields locally, copy `.dev.vars.example` to `.dev.vars` and add a
`RESEND_API_KEY`, and uncomment `TURNSTILE_SITE_KEY` in `wrangler.toml` with the
test key from that file. Without them the fields stay hidden.
```

6. In **Deployment**, add a new step after step 5 and renumber the old step 6 to 7:

```markdown
**6. Turn on email** (optional)

1. Verify a sending domain in [Resend](https://resend.com) and set `EMAIL_FROM` in
   `wrangler.toml` (both `[vars]` and `[env.preview.vars]`).
2. Create a Turnstile widget (Dashboard → Turnstile) for your hostnames and put its
   site key in `TURNSTILE_SITE_KEY` in the same two places.
3. Set the two secrets on the Pages project, for production and for preview:

   ```bash
   npx wrangler pages secret put RESEND_API_KEY
   npx wrangler pages secret put TURNSTILE_SECRET_KEY
   npx wrangler pages secret put RESEND_API_KEY --env preview
   npx wrangler pages secret put TURNSTILE_SECRET_KEY --env preview
   ```

4. Apply migration `0008` (step 2) and redeploy the cleanup worker (step 5), which
   purges the send-cap records.
5. Change the contact address in `src/pages/PrivacyPage.tsx` to one you read.

Leave any of the four unset and email stays off, with the fields hidden.
```

7. In **Security notes**, add a bullet at the end:

```markdown
- **Optional email** never stores an address, never emails an event password, and
  never logs addresses, tokens or Resend's response bodies. User-supplied text is
  escaped in the HTML part and collapsed to one line in the subject. See
  "Optional email" above for the bot check and send caps. The CSP in
  `public/_headers` allows `challenges.cloudflare.com` for the Turnstile script
  and frame, and nothing else third party runs script.
```

8. Replace the **Environment variables** table with:

```markdown
| Variable | Description |
|---|---|
| `R2_PUBLIC_URL` | Optional. Public base URL for the R2 bucket (e.g. `https://pub-xxx.r2.dev`), set as a Pages environment variable (Settings → Variables), not a build variable: only the API reads it. If omitted, banners are served through the `/banners/[filename]` Pages Function. Uploaded banner URLs are validated against it, so changing it later means new uploads use the new base while existing events keep working until their banner is replaced. |
| `EMAIL_FROM` | Optional. The From header for emails, e.g. `Simple Events <events@updates.example.com>`, on a domain verified in Resend. Set in `wrangler.toml`. |
| `RESEND_API_KEY` | Optional secret. Resend API key. Also keys the send-cap hashes, so rotating it resets the caps. |
| `TURNSTILE_SITE_KEY` | Optional. Public Turnstile widget key. Set in `wrangler.toml`. |
| `TURNSTILE_SECRET_KEY` | Optional secret. Turnstile secret for server-side verification. |
| `EMAIL_DAILY_CAP` | Optional. Overall emails per 24 hours. Defaults to 80. |

Email is on only when `EMAIL_FROM`, `RESEND_API_KEY`, `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY` are all set.
```

9. In the paragraph about the API tests (starts "The API tests (`test/api/`) run the real Pages Function"), change its last sentence to:

```markdown
They cover access control, guest-visibility redaction, passwords, bring-list slot
caps, the banner ownership rules, and optional email (with Resend and Turnstile
stubbed at `fetch`).
```

- [ ] **Step 5: Check**

Run: `grep -c "challenges.cloudflare.com" public/_headers`
Expected: `1` (one line, containing it twice).

Run: `npx wrangler pages functions build --outdir .wrangler/plan-check 2>&1 | tail -5; rm -rf .wrangler/plan-check`
Expected: no `wrangler.toml` parse error. (Errors about unresolved imports under `server/email/` mean stream S is still writing; ignore those.)

---

## Coordinator: integrate

- [ ] Run `npm run lint && npm run typecheck && npm run test && npm run build`. Expected: all pass.
- [ ] Check every spec section against the diff; check the Review Focus list has a passing test for each line.
- [ ] Commit in three commits (server, client, privacy and docs).
