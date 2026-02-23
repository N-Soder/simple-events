
# Optional Password with Embed-in-URL Toggle

Make the guest password optional and, when a password is set, let the host choose whether to embed it directly in the guest link.

## What Changes

### Create Event Page (`Index.tsx`)
- Change the password field from required to optional
- Add a toggle: "Require password" (default off). When enabled, show the password input
- Below the password input, add a second toggle: "Embed password in guest link" (default on). This controls whether the created-page guest link includes `#password` in the URL
- Update the Zod schema to make `password` optional (empty string or undefined when disabled)
- Pass a new flag `embed_password` (and the raw password value) to the `/created` page via search params so it can build the correct guest link

### Event Created Page (`EventCreated.tsx`)
- Read `password` and `embed` from the search params (passed from the create flow)
- If a password was set and embed is enabled: guest link becomes `/event/{id}#password`
- If a password was set but embed is disabled: guest link stays `/event/{id}` with a note that guests will need to enter the password manually
- If no password was set: guest link is just `/event/{id}` with a note that the event is open to anyone with the link
- Update the descriptive copy under the guest link card accordingly

### Edge Function (`event-api/index.ts`)
- `POST /create`: Make `password` optional. When no password is provided, store a `NULL` password hash (or a sentinel value)
- `POST /verify`: If the event has no password hash, return `{ valid: true }` immediately
- `GET /event`: If the event has no password, skip password verification and return the data directly (accept requests without a `password` param)
- `POST /rsvp`, `POST /claim-item`, `POST /add-item`: Same -- skip password check when the event has no password

### Guest Event Page (`EventPage.tsx`)
- On load, check if the event requires a password (new lightweight endpoint or try loading without password first)
- If the event has no password, load directly without showing the password gate
- If it has a password, behave as today (check URL hash, localStorage, or prompt)

### API (`api.ts`)
- Update `createEvent` to accept `password` as optional
- Add a `getEventPublic(id)` function or modify `getEvent` to work without a password for public events

## Database Change
- Make `password_hash` nullable: `ALTER TABLE public.events ALTER COLUMN password_hash DROP NOT NULL;`
- Set a default of `NULL`: `ALTER TABLE public.events ALTER COLUMN password_hash SET DEFAULT NULL;`
- The existing placeholder-then-update flow still works; when no password is provided, we simply leave it `NULL`

## Technical Details

### Password flow logic

```text
Creating an event:
  Password toggle OFF --> password_hash = NULL in DB
  Password toggle ON  --> password_hash = hashed value

Guest accessing event:
  password_hash IS NULL --> skip password gate, load event directly
  password_hash IS NOT NULL --> existing flow (hash check, URL fragment, localStorage)

EventCreated page (guest link):
  No password           --> /event/{id}  (copy: "Anyone with this link can view")
  Password + embed ON   --> /event/{id}#thepassword  (copy: "Password is embedded in the link")
  Password + embed OFF  --> /event/{id}  (copy: "Guests will need to enter: [password]")
```

### Search params passed to `/created`
The create page will navigate to `/created?id=X&token=Y&password=Z&embed=1` (or omit password/embed when no password is set). The password is passed in the URL only transiently so the created page can build the embedded guest link -- the user is already warned to save these links.

### Edge function changes for passwordless events
In every endpoint that currently calls `__verify_event_password`, we first check if the event has a `password_hash`. If it is `NULL`, we skip verification. This is done by fetching the event row and checking the field before calling the RPC.
