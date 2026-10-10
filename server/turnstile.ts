const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// The check runs before anything is saved, so a stalled one must not hang the request.
const TIMEOUT_MS = 5_000;

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
    const response = await fetch(VERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
