

# RSVP Management via Link Instead of Code

## Change

Instead of showing a short alphanumeric code after RSVP submission, the app will generate a direct link that guests can save or bookmark to manage their RSVP from any device.

## How It Works

**After submitting an RSVP, the guest sees:**
> "RSVP submitted! Save this link to edit your RSVP from another device:"
> `https://[app-url]/event/{eventId}#rsvp={rsvpId}:{manageCode}`

The manage credentials are embedded in the URL hash fragment (just like the event password), so they never hit server logs.

**On page load:**
- The app checks localStorage first (for returning guests on the same device)
- If not in localStorage, it checks the URL hash for `rsvp=` parameters
- If found via either method, the guest's RSVP is loaded and shown with Update/Cancel options

## What Changes from the Previous Plan

- **Manage code is still generated** server-side (6-char alphanumeric) -- it's just embedded in a link rather than displayed as a standalone code
- **No "enter your code" input field** -- replaced by the link approach
- The "Manage existing RSVP" text link is removed; the manage link handles cross-device access
- Everything else (localStorage for same-device, edge function endpoints, database changes) stays the same as the approved plan

## Technical Details

### URL hash format:
```
#password#{manageCode}:{rsvpId}
```
or if password is already in the hash:
```
#eventPassword&rsvp={rsvpId}:{manageCode}
```

### Hash parsing on EventPage load:
1. Parse hash for event password (existing behavior)
2. Also extract `rsvp` param if present
3. If found, store in localStorage for future visits and load the RSVP for editing

### Manage link display:
- Shown in a copyable text field (like the admin/guest links on the EventCreated page)
- Copy button included for convenience

