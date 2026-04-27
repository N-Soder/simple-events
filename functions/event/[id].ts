interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function descriptionSnippet(description: string | null): string {
  if (!description) return "Join us for this event on Simple Events.";
  const firstLine = description
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? "";
  const stripped = firstLine
    .replace(/^#+\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
  return stripped.length > 200 ? stripped.slice(0, 197) + "..." : stripped;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const eventId = context.params.id as string;

  const event = await context.env.DB.prepare(
    "SELECT name, description, banner_url FROM events WHERE id = ?"
  )
    .bind(eventId)
    .first<{ name: string; description: string | null; banner_url: string | null }>();

  const indexRequest = new Request(
    new URL("/index.html", context.request.url).href,
    context.request
  );
  const assetResponse = await context.env.ASSETS.fetch(indexRequest);
  const html = await assetResponse.text();

  if (!event) {
    return new Response(html, {
      status: assetResponse.status,
      headers: { "content-type": "text/html;charset=UTF-8" },
    });
  }

  const title = escapeHtml(event.name);
  const description = escapeHtml(descriptionSnippet(event.description));
  const url = escapeHtml(context.request.url);

  const tags = [
    `<title>${title} - Simple Events</title>`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
  ];

  if (event.banner_url) {
    const img = escapeHtml(event.banner_url);
    tags.push(`<meta property="og:image" content="${img}" />`);
    tags.push(`<meta name="twitter:image" content="${img}" />`);
  }

  const modified = html.replace("<head>", `<head>\n  ${tags.join("\n  ")}`);

  return new Response(modified, {
    status: assetResponse.status,
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
};
