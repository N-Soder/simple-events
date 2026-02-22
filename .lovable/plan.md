

# Batch Bring List Claims on RSVP Submit

## What Changes

Currently, clicking "I'll bring it" on a bring list item immediately calls the API to claim it. Instead, item selections will be collected locally and only sent to the server when the guest submits their RSVP.

## How It Works

1. Guest fills in their name, adults, kids
2. Guest toggles bring list items they want to bring (and/or adds custom items) -- these are tracked in local state only, nothing hits the server yet
3. Guest clicks "Submit RSVP" at the bottom
4. On submit: the RSVP is created first, then all selected item claims and custom items are sent to the server

## Frontend Changes (`src/pages/EventPage.tsx`)

- Add a `selectedItems` state (`Set<string>`) to track which existing item IDs the guest wants to claim
- Add a `customItems` state (`string[]`) to track custom items the guest typed in
- Replace the "I'll bring it" button with a toggle/checkbox -- clicking it adds/removes the item ID from `selectedItems` (no API call)
- The "Add your own item" input appends to the local `customItems` array instead of calling the API
- Custom items appear in the list with an "X" button to remove them before submitting
- In `handleRsvp`:
  1. Submit the RSVP (POST /rsvp)
  2. For each item in `selectedItems`, call `claimItem()` with the guest's name
  3. For each item in `customItems`, call `addCustomItem()` with the guest's name
  4. Reload event data and show the success screen
- Remove the standalone `claimName` input -- the guest's RSVP name is used for all claims
- Remove the individual `handleClaim` and `handleAddCustom` functions as standalone actions

## Edge Function

No changes needed -- the existing `claim-item` and `add-item` endpoints are called in sequence after the RSVP is created. The batching happens on the frontend.

## API (`src/lib/api.ts`)

No changes needed -- existing `claimItem` and `addCustomItem` functions are reused.

## UI Behavior

- Unclaimed items show a checkbox/toggle instead of "I'll bring it" button
- Already-claimed items (by other guests) still show "-- ClaimedByName" and are not toggleable
- Custom items added by the guest appear inline in the list with a remove button
- The submit button label could say "Submit RSVP" regardless, keeping it simple
- If the RSVP succeeds but some claims fail, a warning toast is shown but the RSVP is still considered submitted

