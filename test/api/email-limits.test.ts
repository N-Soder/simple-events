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
  it("deletes rows the 24-hour caps no longer look at and keeps the rest", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO email_sends (id, address_hash, event_id, sent_at) VALUES ('old', 'h', 'e', datetime('now', '-25 hours'))"),
      env.DB.prepare("INSERT INTO email_sends (id, address_hash, event_id, sent_at) VALUES ('recent', 'h', 'e', datetime('now', '-23 hours'))"),
    ]);
    expect(await purgeOldSends(env.DB)).toBe(1);
    const { results } = await env.DB.prepare("SELECT id FROM email_sends").all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(["recent"]);
  });
});
