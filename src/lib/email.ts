import type { EmailStatus } from "./api";

// The same rule as `normalizeEmail` in server/email/limits.ts. Keep the two in
// step: an address that passes here but not there is only rejected after the
// form has been submitted, as a toast rather than a message on the field.
const MAX_EMAIL_LENGTH = 254;
const EMAIL_RE = /^[^\s@<>(),;:"[\]\\]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function isValidEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email);
}

/** What to tell someone about the email they asked for. */
export interface EmailNotice {
  address: string;
  status: EmailStatus;
}

// The create form hands its notice to the "created" page through this variable
// rather than router state. Router state is written to the browser's history
// entry, where the address would outlive the page and survive a restart; this
// is gone on the next page load. Only the latest notice is kept.
let remembered: { eventId: string; notice: EmailNotice } | null = null;

export function rememberEmailNotice(eventId: string, notice: EmailNotice | null): void {
  remembered = notice ? { eventId, notice } : null;
}

export function emailNoticeFor(eventId: string): EmailNotice | null {
  return remembered?.eventId === eventId ? remembered.notice : null;
}
