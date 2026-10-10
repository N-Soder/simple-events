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
    // Bounded, so a stalled check fails closed quickly instead of hanging the request.
    expect(init!.signal).toBeInstanceOf(AbortSignal);
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
