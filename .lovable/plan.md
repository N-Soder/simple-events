
# Add Quantity Support for Bring List Items

Allow the event host to request multiple of the same item (e.g., "Salad x2") by adding a `quantity` column to bring list items.

## How It Works

- Each bring list item gets a `quantity` field (default 1)
- On the admin page, when adding an item, the host can specify how many are needed (e.g., "Salad" with quantity 2)
- On the guest page, each "slot" appears as a separate claimable checkbox. So "Salad x2" shows as two claimable rows: "Salad (1/2)" and "Salad (2/2)"
- Guests claim individual slots, not the whole quantity at once

## Database Change

```sql
ALTER TABLE public.bring_list_items ADD COLUMN quantity integer NOT NULL DEFAULT 1;
```

This stores how many of each item the host wants. Each row still represents one claimable slot. When the admin adds "Salad x2", it inserts 2 separate rows with `item_name = 'Salad'`. This keeps claiming logic unchanged -- each row is independently claimable.

## Changes

### Edge Function (`supabase/functions/event-api/index.ts`)

- `POST /create`: When processing `bring_items`, accept objects with `{ name, quantity }` instead of plain strings. Insert `quantity` rows for each item.
- `POST /admin/add-bring-item`: Accept an optional `quantity` param (default 1). Insert that many rows with the same `item_name`.

### Admin Page (`src/pages/AdminPage.tsx`)

- Add a small quantity input (number, min 1, max 20) next to the "Add item" text input
- When adding, call the API which inserts multiple rows
- In the item list, group items by name and show count, e.g., "Salad (2 requested, 1 claimed)"
- Delete button removes individual rows as before

### Create Event Page (`src/pages/Index.tsx`)

- Add a quantity input next to each bring list item input
- Store bring items as `{ name: string, quantity: number }[]` instead of `string[]`
- Pass the structured data to the API

### Guest Page (`src/pages/EventPage.tsx`)

- No structural changes needed -- each row is already independently claimable
- Items with the same name will naturally appear as separate rows guests can each claim

### API Types (`src/lib/api.ts`)

- Update `CreateEventPayload.bring_items` from `string[]` to `Array<{ name: string; quantity: number }>`

## Technical Details

### Why multiple rows instead of a quantity column with partial claims?

Using one row per claimable slot keeps the claiming logic simple: each row has a single `claimed_by` field. No need for tracking partial claims, array columns, or join tables. The quantity is effectively the count of rows with the same `item_name` for that event.

### Admin grouping display

On the admin page, items are grouped visually by name for clarity:
- "Salad" -- 2 total, 1 claimed (by Alice)
- "Dessert" -- 2 total, 0 claimed

Each individual row still has its own delete button.
