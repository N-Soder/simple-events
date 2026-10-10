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
