

# Dynamic SEO Meta Tags Per Event

## Problem
When sharing an event link (e.g. on Discord, iMessage, Twitter), the preview always shows the static "Sophia's Birthday" title and the generic party bunting image — regardless of which event is being shared.

## Approach
Social media crawlers don't execute JavaScript, so client-side meta tag updates won't work. We need a **server-side solution** that returns the correct `<meta>` tags when a crawler (or any client) requests `/event/:id`.

### New Edge Function: `og-image`
Create a lightweight edge function at `supabase/functions/og-image/index.ts` that:
1. Receives the event ID as a query parameter
2. Fetches the event's `name` and `banner_url` from the database
3. Returns an HTML page with the correct OG meta tags + a JavaScript redirect to the real SPA

### Update `public/_redirects`
Add a rule so that `/event/:id` requests hit the edge function first:
```
/event/*  https://mebrvxszumnfhmnmdlcz.supabase.co/functions/v1/og-image?path=:splat  200
/*        /index.html  200
```

### Edge Function Logic
```
- Parse event ID from query param
- Fetch event name + banner_url from DB
- Return HTML with:
  - <title>{event.name}</title>
  - og:title = event.name
  - og:description = "Events made simple"
  - og:image = event.banner_url (or fallback to default image)
  - twitter:card, twitter:title, twitter:image
  - <script>window.location.replace(original URL)</script>
  - <noscript> link to the page
```

Crawlers read the meta tags; real browsers get redirected instantly to the SPA which renders normally.

## Files Changed
1. **New**: `supabase/functions/og-image/index.ts` — edge function serving dynamic HTML with OG tags
2. **Edit**: `public/_redirects` — route `/event/*` through the edge function

