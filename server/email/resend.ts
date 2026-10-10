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
