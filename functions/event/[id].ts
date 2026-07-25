interface Env {
  DB: D1Database;
}

// Boundaries of the metadata block in index.html. Both stay in the output so a
// `curl` of a guest link makes it obvious whether this function ran.
const BLOCK_START = "<!-- social-preview:start -->";
const BLOCK_END = "<!-- social-preview:end -->";

const SITE_NAME = "Simple Events";

// Sits under the event name in a preview. Deliberately generic rather than the
// event's own description: descriptions are Markdown, can run to 5000
// characters, and are detail the host may not want pasted into a group chat.
const EVENT_DESCRIPTION = "Events made easy. RSVP in seconds, no account needed.";

// Long names read badly as a preview title and as a browser tab label. Every
// platform truncates too, but at its own width and without our control.
const MAX_TITLE_LENGTH = 90;

interface EventRow {
  name: string;
  banner_url: string | null;
  password_hash: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function previewTitle(name: string): string {
  const collapsed = name.replace(/\s+/g, " ").trim();
  if (!collapsed) return SITE_NAME;
  if (collapsed.length <= MAX_TITLE_LENGTH) return collapsed;
  return `${collapsed.slice(0, MAX_TITLE_LENGTH - 3).trimEnd()}...`;
}

// banner_url is stored as an absolute R2 URL when R2_PUBLIC_URL is configured
// and as a relative /banners/<key> path otherwise. Crawlers only fetch absolute
// URLs, so the relative form has to be resolved against the page.
function absoluteImageUrl(bannerUrl: string | null, pageUrl: string): string | null {
  if (!bannerUrl) return null;
  try {
    const resolved = new URL(bannerUrl, pageUrl);
    // banner_url is not validated when written, so only pass through schemes a
    // crawler can actually fetch.
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return null;
    return resolved.href;
  } catch {
    return null;
  }
}

function metadataFor(event: EventRow, eventId: string, pageUrl: string): string {
  const title = escapeHtml(previewTitle(event.name));
  const description = escapeHtml(EVENT_DESCRIPTION);
  const canonical = escapeHtml(new URL(`/event/${encodeURIComponent(eventId)}`, pageUrl).href);
  const image = absoluteImageUrl(event.banner_url, pageUrl);

  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    // A banner is worth a full-width card; without one the large card renders as
    // an empty box on most platforms.
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
  ];

  if (image) {
    const src = escapeHtml(image);
    tags.push(`<meta property="og:image" content="${src}" />`);
    tags.push(`<meta property="og:image:alt" content="Banner for ${title}" />`);
    tags.push(`<meta name="twitter:image" content="${src}" />`);
  }

  return tags.join("\n    ");
}

export const onRequest: PagesFunction<Env, "id"> = async (context) => {
  const { request, env, params } = context;

  // Ask for the built shell by name. Nothing from the incoming request is
  // forwarded: an If-None-Match from a repeat visitor would come back as a
  // bodyless 304 and leave us with no HTML to rewrite.
  const shell = await context.next(new URL("/index.html", request.url).href);
  const source = await shell.text();

  const rawId = params.id;
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId;
  const start = source.indexOf(BLOCK_START);
  const end = source.indexOf(BLOCK_END);

  let html = source;

  if (eventId && start !== -1 && end > start) {
    try {
      const event = await env.DB.prepare(
        "SELECT name, banner_url, password_hash FROM events WHERE id = ?"
      )
        .bind(eventId)
        .first<EventRow>();

      // Unknown event, or one whose details are password gated: leave the
      // default Simple Events preview alone. GET /api/event refuses to hand out
      // the name, description, or banner of a protected event without the
      // password, and an unauthenticated preview must not undercut that.
      if (event && event.password_hash === null) {
        html =
          source.slice(0, start + BLOCK_START.length) +
          "\n    " +
          metadataFor(event, eventId, request.url) +
          "\n    " +
          source.slice(end);
      }
    } catch {
      // A D1 hiccup must not take the guest link down with it. Falling through
      // serves the generic preview, which is what shipped before this function.
    }
  }

  const headers = new Headers(shell.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  // The body now varies per event, so the shell's validators no longer describe
  // it. Leaving them would let one event's preview be served for another.
  headers.delete("etag");
  headers.delete("content-length");
  headers.set("cache-control", "no-cache");

  return new Response(html, { status: shell.status, headers });
};
