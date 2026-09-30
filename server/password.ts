import bcrypt from "bcryptjs";

// Event passwords are hashed with PBKDF2 through WebCrypto, which runs natively.
// bcryptjs is pure JavaScript and cost 10 takes ~100 ms of CPU, ten times the
// Workers free plan's per-request budget. The iteration count is stored in the
// hash, so it can be raised later without invalidating existing hashes.
//
// Hashing only happens when a password is set (create, admin update) and when a
// guest first unlocks an event (POST /api/verify). Every later request carries
// an access token instead, which costs one HMAC to check (see accessTokenFor).
const PBKDF2_ITERATIONS = 30_000;
const PREFIX = "pbkdf2-sha256";

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** `pbkdf2-sha256$<iterations>$<salt>$<hash>`, base64url-encoded. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${PREFIX}$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/**
 * Check a password against a stored hash. Events created before the switch to
 * PBKDF2 hold bcrypt hashes; a correct password for one of those comes back
 * with `rehash`, a PBKDF2 hash to store in its place, so each legacy event pays
 * the bcrypt cost at most once.
 */
export async function checkPassword(password: string, stored: string): Promise<{ valid: boolean; rehash?: string }> {
  if (stored.startsWith("$2")) {
    const valid = await bcrypt.compare(password, stored);
    return valid ? { valid, rehash: await hashPassword(password) } : { valid };
  }
  const [prefix, iterations, salt, hash] = stored.split("$");
  if (prefix !== PREFIX || !iterations || !salt || !hash) return { valid: false };
  const actual = await pbkdf2(password, fromBase64Url(salt), Number(iterations));
  return { valid: constantTimeEqual(actual, fromBase64Url(hash)) };
}

async function hmacKey(passwordHash: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(passwordHash), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const tokenMessage = (eventId: string) => encoder.encode(`event-access:v1:${eventId}`);

/**
 * A token proving the holder knew the event's password, keyed on the stored
 * hash. It needs no server secret, never leaves the server in a form that
 * reveals the password, and stops working as soon as the password is changed
 * or removed, because the hash it is keyed on changes.
 */
export async function accessTokenFor(eventId: string, passwordHash: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(passwordHash), tokenMessage(eventId));
  return toBase64Url(sig);
}

export async function isValidAccessToken(eventId: string, passwordHash: string, token: string | null | undefined): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  let sig: Uint8Array;
  try {
    sig = fromBase64Url(token);
  } catch {
    return false;
  }
  return crypto.subtle.verify("HMAC", await hmacKey(passwordHash), sig, tokenMessage(eventId));
}
