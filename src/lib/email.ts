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
