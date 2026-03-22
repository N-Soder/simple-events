

# RSVP Cancellation Feature

## Overview
Add a `cancelled` boolean column to the `rsvps` table. Guests can cancel from the edit view, and admins see cancelled RSVPs with a strikethrough, excluded from totals.

## Database Migration
Add `cancelled` column to `rsvps` table:
```sql
ALTER TABLE public.rsvps ADD COLUMN cancelled boolean NOT NULL DEFAULT false;
```

## Edge Function Changes (`supabase/functions/event-api/index.ts`)

1. **GET /event** and **GET /admin**: Include `cancelled` in the RSVP select fields
2. **GET /rsvp/manage**: Include `cancelled` in the select
3. **PUT /rsvp/update**: Accept an optional `cancelled` boolean field and apply it as an update
4. **POST /rsvp**: When a previously-cancelled guest re-RSVPs, optionally handle (or just let them submit fresh)

## Frontend Changes

### `src/pages/EventPage.tsx`
- Add `cancelled` to the RSVP type definitions
- In the **RsvpSummaryCard** view (returning guest, not editing): show a "Cancel RSVP" button
- Wire up a `handleCancelRsvp` function that calls `updateRsvp` with `cancelled: true`, unclaims all items, then reloads
- If the managed RSVP is cancelled, show a muted summary indicating "You cancelled your RSVP" with option to re-RSVP (sets `cancelled: false`)
- Exclude cancelled RSVPs from guest list display and tallies on the event page

### `src/components/RsvpSummaryCard.tsx`
- Accept optional `cancelled` prop
- If cancelled: show muted/strikethrough styling and a "Re-RSVP" button instead of "Edit"
- If active: add a "Cancel RSVP" destructive button (with confirmation via AlertDialog)

### `src/pages/AdminPage.tsx`
- Add `cancelled` to the RSVP type
- Show cancelled RSVPs with strikethrough name + "Cancelled" badge
- Exclude cancelled RSVPs from the totals (adults/kids counts)
- Keep them visible so admin has full history

### `src/lib/api.ts`
- Add `cancelled` to the `updateRsvp` params type

## Files Changed
1. **Migration**: Add `cancelled` column to `rsvps`
2. `supabase/functions/event-api/index.ts` — include `cancelled` in selects, handle in update
3. `src/lib/api.ts` — add `cancelled` param
4. `src/pages/EventPage.tsx` — cancel/re-RSVP logic
5. `src/components/RsvpSummaryCard.tsx` — cancel button + cancelled state UI
6. `src/pages/AdminPage.tsx` — strikethrough + exclude from totals

