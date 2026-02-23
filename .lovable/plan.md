
# Unified RSVP + Bring List Flow with Grouped Items

## Overview
Wrap the RSVP form and bring list inside a single `<form>` so the "Submit RSVP" button sits at the very bottom -- below the bring list when visible. Also group duplicate bring list items (e.g. 3x "salad") into a single compact row with a counter selector.

## Changes (all in `src/pages/EventPage.tsx`)

### 1. Merge RSVP Card and Bring List Card into one form
- Remove the standalone RSVP `<Card>` and the standalone Bring List `<Card>`
- Replace with a single `<Card>` titled "RSVP" that contains:
  1. Name, Adults, Kids fields (same as today)
  2. Bring List section (if enabled and items exist) -- rendered as a sub-section with the utensils icon header, markdown message, grouped items, custom item input
  3. "Submit RSVP" button at the bottom of the card
- The whole card is one `<form onSubmit={handleRsvp}>` so everything submits together

### 2. Group duplicate bring list items
Instead of rendering each DB row individually, group items by `item_name`:

- Build a grouped data structure: `{ name: string, total: number, claimed: number, claimedByNames: string[], availableIds: string[] }`
- For each group, render a single row showing:
  - Item name with count badge: **salad** x 3
  - Status: "2 of 3 claimed" in muted text
  - If unclaimed slots exist: a small +/- stepper or a number input (capped at available count) letting the guest choose how many they want to bring
  - If fully claimed: show a check icon with "All claimed" in muted text
- This replaces the long flat list of individual checkboxes

### 3. Update selection state
- Change `selectedItems` from `Set<string>` (item IDs) to a smarter structure
- Use a `Map<string, string[]>` keyed by item name, where the value is the array of item IDs the guest wants to claim
- When the guest picks "2 salads", we grab the first 2 available (unclaimed) IDs from that group
- `toggleItem` is replaced with an `updateItemCount(itemName: string, count: number)` function that slices the appropriate number of available IDs

### 4. Submit button placement
- The button moves from inside the RSVP-only card to after the bring list section, still within the same `<form>`
- Visually it sits at the bottom of the combined card

## Visual Layout (approximate)

```text
+----------------------------------+
| RSVP                             |
|                                  |
| Your Name *  [_______________]   |
| Adults [__]    Kids [__]         |
|                                  |
| --- Bring List -----------------  |
| (markdown message)               |
|                                  |
| salad x 3      1/3 claimed  [-1+]|
| drinks x 3     1/3 claimed  [-1+]|
| (custom items listed here)       |
| [Add your own item...] [+]      |
|                                  |
| [Submit RSVP]                    |
+----------------------------------+
```

## Technical Details

### Grouping logic (computed from `bring_items`)
```typescript
const grouped = useMemo(() => {
  const map = new Map<string, { total: number; claimed: number; claimedBy: string[]; availableIds: string[] }>();
  for (const item of bring_items) {
    const entry = map.get(item.item_name) || { total: 0, claimed: 0, claimedBy: [], availableIds: [] };
    entry.total++;
    if (item.claimed_by) {
      entry.claimed++;
      entry.claimedBy.push(item.claimed_by);
    } else {
      entry.availableIds.push(item.id);
    }
    map.set(item.item_name, entry);
  }
  return Array.from(map.entries());
}, [bring_items]);
```

### Selection state change
- Replace `selectedItems: Set<string>` with `selectedCounts: Map<string, number>` (item name to count)
- On submit, resolve counts back to actual item IDs by taking the first N available IDs from each group
- The claim promises are built from these resolved IDs (same `claimItem` API calls as before)

### Stepper UI per grouped row
- Show a compact +/- control (two small buttons around a number) when `availableIds.length > 0`
- Min 0, max = number of available (unclaimed) slots
- When total is 1 and unclaimed, fall back to a simple checkbox for simplicity
