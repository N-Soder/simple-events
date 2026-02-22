
# Toggle Bring List Visibility

Add a boolean `bring_list_enabled` flag to events so hosts can show or hide the entire bring list section for guests.

## Database Change

Add a new column to the `events` table:

```sql
ALTER TABLE public.events ADD COLUMN bring_list_enabled boolean NOT NULL DEFAULT true;
```

Default is `true` so existing events keep their bring list visible.

## Edge Function (`supabase/functions/event-api/index.ts`)

- In the `POST /create` handler, accept `bring_list_enabled` from the request body and include it in the insert (default `true`)
- In the `GET /event` handler, include `bring_list_enabled` in the selected fields for the event
- In the `GET /admin` handler, include `bring_list_enabled` in the selected fields
- In the `PUT /admin/update` handler, allow updating `bring_list_enabled`

## Frontend Changes

### `src/pages/Index.tsx` (Create Event)
- Add a `Switch` toggle above the bring list section labeled "Enable Bring List"
- Default to off (no bring list items by default) -- or on, depending on preference. Since the current flow already shows the bring list input, keep it defaulting to on.
- When toggled off, hide the bring list input and items
- Pass `bring_list_enabled` in the create event API call

### `src/pages/AdminPage.tsx` (Admin Edit)
- Add `bringListEnabled` to local state, initialized from the event data
- Add a `Switch` toggle in the event edit form to enable/disable the bring list
- Include `bring_list_enabled` in the save payload
- When disabled, the bring list management section can still be shown to the admin (so they can pre-fill items) but with a note that it's hidden from guests

### `src/pages/EventPage.tsx` (Guest View)
- Read `bring_list_enabled` from the event data
- Only render the bring list card and the bring list checkboxes in the RSVP form when `bring_list_enabled` is `true`

### `src/lib/api.ts`
- Add `bring_list_enabled` to the `createEvent` payload type
- Add `bring_list_enabled` to the `updateEvent` payload type

### Type Updates
- Add `bring_list_enabled: boolean` to the event interfaces in `EventPage.tsx`, `AdminPage.tsx`, and any shared types

## Technical Details

- The `Switch` component from `@/components/ui/switch` is already available
- The column defaults to `true` so no migration issues with existing data
- The edge function's `GET /event` response already returns all event columns via `select("*")` or explicit fields -- `bring_list_enabled` needs to be added to the select list if fields are explicit
