
# RSVP Success Screen, Edit Link, and Returning Guest Detection

## Overview
After submitting an RSVP, show a success screen with a unique edit link. Store the RSVP locally so returning guests see their submission instead of the RSVP form. The edit link uses a `manage_code` stored on the RSVP row for secure access without exposing guest names.

## Database Change
Add a `manage_code` column to the `rsvps` table:
```sql
ALTER TABLE public.rsvps ADD COLUMN manage_code uuid NOT NULL DEFAULT gen_random_uuid();
```
This code is returned on RSVP creation and used to look up/edit the RSVP later.

## Edge Function Changes (`event-api/index.ts`)

1. **POST /rsvp** -- return `manage_code` in the response (already returns the full row via `.select().single()`, so it will be included automatically after the migration).

2. **GET /rsvp/manage?event_id=...&rsvp_id=...&code=...** (new endpoint) -- look up an RSVP by ID + manage_code. Returns the RSVP details and any bring list items claimed by that guest. Used for both the manage link and returning-guest detection.

3. **PUT /rsvp/update** (new endpoint) -- update an existing RSVP (name, adults, kids, bring list changes) using rsvp_id + manage_code for auth. Allows guests to edit their submission.

## Frontend Changes

### `src/pages/EventPage.tsx`
- Add a `submittedRsvp` state that holds `{ rsvp_id, manage_code, guest_name, adults, kids, claimedItems }`.
- On mount, check localStorage for `rsvp_manage_{eventId}` (stores `{ rsvp_id, manage_code }`). Also check URL hash for `manage={rsvp_id}.{manage_code}` format.
- If found, call the new manage endpoint to fetch the RSVP. If valid, set `submittedRsvp` and show a "Your RSVP" summary card instead of the RSVP form.
- After a successful RSVP submission:
  - Save `{ rsvp_id, manage_code }` to localStorage under `rsvp_manage_{eventId}`.
  - Set `submittedRsvp` to trigger the success screen.
- Add a **success screen** view (shown when `submittedRsvp` is set and `showSuccessScreen` is true):
  - Checkmark icon + "RSVP Submitted!" heading
  - Summary: name, adults, kids, claimed items
  - Edit link displayed in a copyable code block: `/event/{eventId}#manage={rsvp_id}.{manage_code}`
  - Warning text: "Save this link -- it won't be shown again."
  - "View Event" button to dismiss the success screen and show the event details with the "Your RSVP" card
- **Returning guest view** (shown when `submittedRsvp` is set but `showSuccessScreen` is false):
  - A "Your RSVP" card replacing the RSVP form, showing their name, guest counts, and claimed items
  - An "Edit RSVP" button to switch the card into edit mode (re-populate the form fields)
  - A small link to their manage URL for reference

### URL Hash Strategy
The event page URL hash is already used for passwords. Extend the scheme:
- `#password` -- event password (existing)
- `#manage=rsvpId.manageCode` -- RSVP manage link
- On mount, detect which format is in the hash and act accordingly. Password hashes won't contain `=` or `.`, so the formats are distinguishable.

### `src/lib/api.ts`
- Add `getRsvpByManageCode(event_id, rsvp_id, manage_code)` function
- Add `updateRsvp(rsvp_id, manage_code, updates)` function

## Flow Summary

```text
Guest submits RSVP
  --> API returns { id, manage_code, ... }
  --> Save { rsvp_id, manage_code } to localStorage
  --> Show success screen with manage link + warning to save it
  --> "View Event" button dismisses success screen

Guest returns to /event/{id} (same device)
  --> localStorage has rsvp_manage_{id}
  --> Fetch RSVP via manage endpoint
  --> Show "Your RSVP" summary card instead of form
  --> "Edit RSVP" button available

Guest opens manage link /event/{id}#manage=rsvpId.code (any device)
  --> Parse hash, fetch RSVP via manage endpoint
  --> Show "Your RSVP" summary card
  --> "Edit RSVP" button available
```

## Technical Details

### localStorage keys
- `event_pw_{eventId}` -- event password (existing)
- `rsvp_manage_{eventId}` -- JSON: `{ rsvp_id: string, manage_code: string }`

### Manage endpoint response shape
```typescript
{
  rsvp: { id, guest_name, adults, kids, manage_code, created_at },
  claimed_items: [{ id, item_name }]  // items claimed by this guest
}
```

### Edit mode behavior
When "Edit RSVP" is clicked:
- Pre-populate form fields with existing values
- Show the bring list with current selections pre-checked
- Submit button changes to "Update RSVP"
- On submit, call PUT /rsvp/update with the changes
- On success, refresh and show updated "Your RSVP" card
