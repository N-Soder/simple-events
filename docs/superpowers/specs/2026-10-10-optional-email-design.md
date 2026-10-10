# Optional email: design

Date: 2026-10-10

## Goal

Let a host or a guest choose to have their links emailed to them, without
adding accounts and without Simple Events keeping anyone's email address.

Today the admin link and the guest's private edit link exist only on screen and
in `localStorage`. Someone who closes the tab on a borrowed device, or whose
browser clears site data, loses them. An optional email is a second copy.

## Decisions (agreed with Nick)

- Email is optional for hosts and for guests. Nothing else in the flow changes
  for someone who leaves the field empty.
- Addresses are **used once and never stored**. Neither the host's nor the
  guest's address is written to D1 in readable form.
- Version 1 sends two emails: the host's links on creation, and the guest's
  RSVP confirmation.
- Sends are protected by Cloudflare Turnstile and by daily send caps.
- Mail is sent through Resend from the already verified
  `updates.soderholm.app`, as `Simple Events <events@updates.soderholm.app>`.
  The privacy contact is `privacy@soderholm.app`.

## Out of scope

Admin link recovery, new-RSVP notifications to the host, reminders, "details
changed" emails, resend buttons, and anything else that needs a stored
address. Each can be added later; none is prepared for here.

## How it works

### Feature switch

`GET /api/config` returns `{ emailEnabled, turnstileSiteKey }`.
`emailEnabled` is true only when all four of these are set:

| Name | Kind | Purpose |
|---|---|---|
| `RESEND_API_KEY` | secret | Resend API key |
| `EMAIL_FROM` | var | From header |
| `TURNSTILE_SITE_KEY` | var | Public widget key |
| `TURNSTILE_SECRET_KEY` | secret | Server-side verification |

When it is false the email fields are not rendered and a request carrying an
`email` is rejected with 400. A fork with none of these set behaves exactly as
the app does today.

One optional var, `EMAIL_DAILY_CAP` (default 80), sets the overall daily cap.
The default leaves headroom on Resend's free tier of 100 a day, which Secret
Santa shares.

### Host: links on creation

1. The create form gets an optional "Email me the links" field in the main
   details, with the hint "Used once to send your links. Not stored." and a
   link to `/privacy`.
2. When the field is non-empty, the Turnstile script is loaded and an invisible
   token is obtained before submit.
3. `POST /api/create` accepts optional `email` and `turnstile_token`. With an
   email present it validates the address and verifies the token **before**
   creating anything, so a failed check leaves no half-made event. A failed
   check is a 403 the form shows inline; the host can retry or clear the field.
4. The event is created as today. Then a send slot is reserved (see caps) and
   the email is sent. The response gains `email: "sent" | "failed" | "limited"`.
   Creation never fails because of email.
5. The created page shows the outcome: "We've emailed these links to
   you@example.com" or "We couldn't send the email. Copy the links below."

Email content: event name and date, the guest link, the admin link as the
button, and the warning to keep the admin link private. The event password is
never included; for a protected event the email says guests will need the
password the host set, and the guest link is the plain one without the
password in its fragment.

### Guest: RSVP confirmation

1. The RSVP form gets an optional "Email me a confirmation" field with the
   hint "Used once to send your confirmation and calendar file. Not stored."
2. Turnstile as above, only when the field is non-empty.
3. `POST /api/rsvp` accepts optional `email` and `turnstile_token`, verified
   before the RSVP is written.
4. After the RSVP is saved the email is sent, and the response gains the same
   `email` status. The success screen shows the outcome.

Email content: event name, date and time in the event's time zone, location
and location link, the guest's own reply (adults, kids, what they are
bringing), a button to their private edit link, a Google Calendar link, and
the event as an `.ics` attachment. The Markdown description is left out, as it
is from link previews. Editing or cancelling an RSVP sends nothing.

The `.ics` is a plain calendar entry (`METHOD:PUBLISH`), not a meeting
invitation, so no accept or decline replies are generated.

### Every email

- HTML and plain-text parts, table layout with inline styles, colours from
  `docs/DESIGN.md`.
- All user-supplied text (event name, guest name, location, item names) is
  HTML-escaped. Links are built from the request's origin, so preview
  deployments link to themselves.
- Footer: "You're getting this because this address was entered on
  {host}. It was used once and isn't stored, so you won't hear from us again."
  plus a link to `/privacy`.

## Abuse protection

An open email field lets anyone make the domain send mail to any address, with
text they partly control (the event name). Three layers:

1. **Turnstile** on every request that carries an email. It fails closed: a
   missing secret, missing token or network error is a failed check.
2. **Send caps**, reserved atomically before each send in one conditional
   `INSERT ... SELECT`:
   - 3 emails per recipient address per 24 hours
   - 100 emails per event per 24 hours
   - `EMAIL_DAILY_CAP` emails overall per 24 hours

   A request over a cap still succeeds; only the email is skipped
   (`email: "limited"`). A reserved slot is kept when the send fails, so
   failures count too.
3. The existing WAF rate limiting rule already covers `/api/create` and
   `/api/rsvp`.

### Storage for the caps

Migration `0008_email_sends.sql`:

```sql
CREATE TABLE email_sends (
  id TEXT PRIMARY KEY,
  address_hash TEXT NOT NULL,
  event_id TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_email_sends_address ON email_sends(address_hash, sent_at);
CREATE INDEX idx_email_sends_event ON email_sends(event_id, sent_at);
CREATE INDEX idx_email_sends_sent_at ON email_sends(sent_at);
```

`address_hash` is HMAC-SHA256 of the trimmed, lower-cased address. The key is
derived from `RESEND_API_KEY` with a fixed label, so no extra secret is needed
and the hash cannot be reversed by guessing addresses without that key.
The cleanup worker deletes rows older than 48 hours on its nightly run. This
is the only trace of an address the app keeps, and the privacy notice says so.

## Delivery

One `POST https://api.resend.com/emails` per email, awaited inside the
request, with a 10 second timeout and an `Idempotency-Key` of
`simple-events/{email_sends.id}`. One retry on 429 when `Retry-After` is 3
seconds or less. Anything else is `failed`.

There is no outbox and no background retry. Secret Santa needs those because
email is the only way its participants get their links. Here the link is
always on screen as well, so an honest "couldn't send" is enough.

Addresses, tokens and provider response bodies are never logged. A failed send
logs the HTTP status only.

## Privacy notice

A new `/privacy` page in plain English, modelled on Secret Santa's:

- **What we store**: event details and banner; guest names, head counts and
  bring-list claims; a hashed event password if one is set; the admin and
  edit links. Not stored: email addresses, IP addresses, accounts.
- **Email**: used once; a scrambled fingerprint is kept for up to 48 hours to
  limit how many emails one address can be sent; Resend keeps delivery logs,
  including the address and the email, for up to 30 days.
- **This device**: `localStorage` holds your events and your RSVP edit link.
- **Who can see what**: the guest-visibility settings; anyone with a link can
  open it.
- **Services**: Cloudflare (hosting, database, images, and the Turnstile bot
  check when an email is entered) and Resend. No analytics, ads or trackers.
- **Deletion**: 90 days after the event date, or immediately when the host
  deletes the event; Cloudflare backups for up to 30 days after that.
- **Contact and removal requests**: `privacy@soderholm.app`.
- "Last updated" date and "plain-language notice, not legal advice".

Linked from the landing page footer, beside both email fields, and in every
email. The retention figure comes from `RETENTION_DAYS`, not a literal.

## Code layout

| File | Change |
|---|---|
| `server/email/resend.ts` | New. `sendEmail(apiKey, idempotencyKey, payload)` returning a boolean. |
| `server/email/templates.ts` | New. `renderHostLinksEmail`, `renderRsvpEmail`, shared layout, `escapeHtml`. Pure functions. |
| `server/email/limits.ts` | New. Address normalising and validation, hashing, `reserveSend`. |
| `server/turnstile.ts` | New. `verifyTurnstile`, as in Secret Santa. |
| `functions/api/[[route]].ts` | `GET config`; optional `email` handling in `create` and `rsvp`. |
| `src/lib/ics.ts` | Move `downloadIcs` (the only DOM code) into `AddToCalendarButton`, so the server can import `buildIcs` and `googleCalendarUrl`. |
| `src/components/Turnstile.tsx`, `src/components/EmailField.tsx` | New. Lazy script load; shared field with hint and privacy link. |
| `src/lib/api.ts` | `getConfig`; `email` and `turnstile_token` on `createEvent` and `submitRsvp`. |
| `src/pages/CreateEvent.tsx`, `EventPage.tsx`, `EventCreated.tsx`, `src/components/RsvpSuccessScreen.tsx` | Field and outcome messages. |
| `src/pages/PrivacyPage.tsx`, `src/App.tsx`, `LandingPage.tsx` | New page, route, footer link. |
| `migrations/d1/0008_email_sends.sql` | New table. |
| `cleanup-worker/src/index.ts` | Purge `email_sends` older than 48 hours. |
| `public/_headers` | Add `https://challenges.cloudflare.com` to `script-src` and a `frame-src` for it. |
| `wrangler.toml`, `.env.example`, `README.md` | Vars for production and preview; setup and security notes. |

## Error handling

| Case | Result |
|---|---|
| Malformed address | 400 before anything is written; shown under the field. |
| Email sent while email is not configured | 400. |
| Turnstile fails | 403 before anything is written; the form keeps its contents. |
| Over a cap | Event or RSVP saved; `email: "limited"`. |
| Resend error or timeout | Event or RSVP saved; `email: "failed"`. |
| Turnstile script blocked in the browser | The field shows that email isn't available right now; submitting without an email still works. |

## Testing

- **API tests** (workerd, real D1): Resend and Turnstile are stubbed at
  `fetch`. Covers: config reflects the env; create and RSVP without email are
  unchanged and make no outbound call; with email the right payload goes to
  Resend, including the `.ics` attachment and no password; a failed Turnstile
  writes nothing; each cap produces `limited`; a Resend failure still saves
  the event or RSVP; no readable address is in any table afterwards.
- **Unit tests**: templates escape hostile event and guest names; the text
  part contains the links; address validation and hashing.
- **Component tests**: fields hidden when `emailEnabled` is false; outcome
  messages on the created and success screens.
- **Cleanup worker**: old `email_sends` rows are purged, recent ones kept.

## Deployment steps (manual, for Nick)

1. Create a Turnstile widget for the Simple Events hostnames and put the site
   key in `wrangler.toml`.
2. Set `RESEND_API_KEY` and `TURNSTILE_SECRET_KEY` as secrets on the Pages
   project, for production and preview.
3. Apply migration `0008` to both databases before deploying.
4. Redeploy the cleanup worker.
5. Make sure `privacy@soderholm.app` is monitored.
