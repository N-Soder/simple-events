

# Fix: RSVP Update "Load failed" Error

## Root Cause
The CORS headers in the edge function are missing `Access-Control-Allow-Methods`. PUT requests (like the RSVP update) require a CORS preflight, and the browser rejects the request when the preflight response does not list PUT as an allowed method. This results in a network-level error: "Load failed" (Safari) or "Failed to fetch" (Chrome).

## Fix
Add `Access-Control-Allow-Methods` to the `corsHeaders` object in `supabase/functions/event-api/index.ts`:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};
```

This is a one-line addition to the existing `corsHeaders` constant at the top of the edge function. No other changes needed.

