import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "";
  const eventId = path.replace(/^\//, "").split("/")[0].split("#")[0].split("?")[0];

  if (!eventId) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: event } = await supabase
    .from("events")
    .select("name, banner_url")
    .eq("id", eventId)
    .single();

  const title = event?.name || "Event";
  const description = "Events made simple";
  const image = event?.banner_url || "";
  const eventUrl = `https://simple-events.lovable.app/event/${eventId}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${eventUrl}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}
  <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ""}
  <script>window.location.replace("${eventUrl}" + window.location.hash);</script>
</head>
<body>
  <noscript><a href="${eventUrl}">Open event: ${escapeHtml(title)}</a></noscript>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
  });
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
