/**
 * URL helpers for the optional location link.
 *
 * The server validates the same rule on write (see `isSafeHttpUrl` in
 * functions/api). This copy exists because the front end and the Worker are
 * compiled separately with no shared module, and because rendering should not
 * trust stored data blindly: a link is only ever rendered as an anchor after
 * passing this check.
 */

const MAX_URL_LENGTH = 2000;

/** Whether a value is a plain http(s) URL, safe to render as a link. */
export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value || value.length > MAX_URL_LENGTH) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Add a scheme to something that is clearly a web address but was typed
 * without one, so "maps.app.goo.gl/xyz" becomes a usable link.
 */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Whether some text looks like the reader pasted a web address. Used to offer
 * moving a URL out of the location box and into the link field, rather than
 * leaving a bare URL as the printed address.
 */
export function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  // A bare host with a path or a known shortener, e.g. "maps.app.goo.gl/xyz".
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(trimmed) && trimmed.includes("/");
}

/** "https://maps.google.com/foo?x=1" → "maps.google.com" for compact display. */
export function displayHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
