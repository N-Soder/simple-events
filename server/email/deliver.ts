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
