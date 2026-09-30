# Simple Events

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

A lightweight web app for creating private event pages and coordinating RSVPs, no accounts required. Hosts share a link; guests RSVP by name and optionally claim items from a bring list.

## Features

**For hosts**
- Create an event with name, date, start and optional end time, location, and an optional
  Markdown description (with a live preview)
- Upload a banner image, with an optional crop. Any size photo can be picked: the
  browser resizes it to at most 1600 px wide and re-encodes it as WebP before it is
  uploaded, so a 12 MB phone photo is stored as roughly 100 KB
- Optional password protection, which can be added, changed or removed later
- Control guest list visibility: full names, count only, or hidden
- Optional bring list: define items with quantities so guests can claim what they'll bring
- Admin dashboard to view all RSVPs, manage bring list items, and delete entries
- Events are deleted 90 days after their date (see the retention worker below)
- Created events are remembered in the browser, so the admin link can be recovered from
  **Your events** if the tab is closed without saving it

**For guests**
- No account needed, just enter your name
- RSVP with adult and kid counts
- Claim items from the bring list or add your own
- Edit or cancel your RSVP at any time via a personal manage link
- Add the event to a calendar: an `.ics` download or a Google Calendar link

## Link previews

Pasting a guest link into WhatsApp, iMessage, Slack, or similar shows that event's
own name and banner image rather than a generic Simple Events card.

Crawlers do not run JavaScript, so the metadata cannot come from React. Instead
`functions/event/[id].ts` intercepts `/event/:id` at the edge, looks the event up
in D1, and swaps the metadata block in `index.html` (delimited by the
`social-preview:start` / `social-preview:end` comments) for event-specific tags
before the HTML is served. No third-party service or image generator is involved.

Two things are deliberately left out of the preview:

- **The event description.** Descriptions are Markdown, can run long, and are
  detail a host may not want rendered into a group chat, so a fixed tagline is
  used instead.
- **Password-protected events.** These keep the generic preview. `GET /api/event`
  refuses to return a protected event's name or banner without the password, and
  an unauthenticated preview should not undercut that if a link gets forwarded.

Admin links (`/admin/:id`) are untouched and always preview generically.

## Banner images

Hosts pick whatever their camera produced, and the browser does the work before
anything is uploaded (`src/lib/bannerImage.ts`):

- The photo is scaled to fit **1600 × 1000** and re-encoded as **WebP** (JPEG on an
  engine that can't encode WebP). Downscaling happens in halving steps, because a
  single large `drawImage()` aliases fine detail. An 11 MB, 4032 × 3024 photo comes
  out around 90 KB.
- **Cropping is optional** (`BannerCropDialog`): a fixed 2:1 frame with drag, pinch,
  wheel and a zoom slider. The photo is drawn whole with the discarded part dimmed
  rather than hidden, and the stage is shaped to the source (`cropStageAspect`) so
  those margins hold picture instead of dead space. Every crop re-encodes from the
  original file, so adjusting a crop twice does not stack two generations of lossy
  encoding.
- **GIFs are uploaded untouched.** A canvas only sees a GIF's first frame, so
  re-encoding one would silently drop the animation. They answer to the server's
  size limit instead, and the crop control is hidden for them.

The server still validates type and size (`functions/api`), since none of the above
can be trusted from the client. `MAX_UPLOAD_BYTES` in `src/lib/bannerImage.ts` and
`MAX_BANNER_BYTES` in `functions/api/[[route]].ts` are the same number on purpose.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Routing | React Router v6 |
| Data fetching | `fetch` wrappers in `src/lib/api.ts` |
| Backend | Cloudflare Pages Functions |
| Database | Cloudflare D1 (SQLite) |
| File storage | Cloudflare R2 (banner images) |

Server code lives in three places: `functions/` (the Pages Functions: API, link
previews, banner serving), `cleanup-worker/` (the retention cron), and `server/`
(modules both of those import, such as the banner URL rules and password hashing).

## Local development

**Prerequisites:** Node.js and npm

```bash
git clone <your-git-url>
cd simple-events
npm install
npm run dev
```

The dev server runs at `http://localhost:8080`. API requests proxy to Cloudflare Workers via Vite.

Other scripts:

```bash
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # front end, plus functions/, server/ and cleanup-worker/ in strict mode
npm run test       # front-end tests, then the API tests
npm run test:api   # API tests only
```

The API tests (`test/api/`) run the real Pages Function inside workerd with a
local D1 and R2 and the migrations applied, via
`@cloudflare/vitest-pool-workers`. They cover access control, guest-visibility
redaction, passwords, bring-list slot caps, and the banner ownership rules.

### Running the Pages Functions locally

`npm run dev` runs Vite alone, which does **not** execute anything in
`functions/`. Link previews, the API, and banner serving all live there, so use
the edge runtime instead:

```bash
npm run db:local   # apply migrations to the local D1 (once, and after any new migration)
npm run dev:edge   # build, then serve on http://localhost:8788 with D1 and R2 bound
```

This runs the same runtime Cloudflare does, with a local D1 under `.wrangler/`
that starts empty, so create an event through the UI to get something to test
against. `dev:edge` builds first and serves the built output, so re-run it after
changing anything in `src/`. Functions themselves are picked up without a
rebuild.

To check a link preview, read the served HTML rather than pasting the link into
a chat app, which caches unfurls per URL:

```bash
curl -s http://localhost:8788/event/<event-id> | grep -E 'og:|twitter:|<title>'
```

An event with no password should come back with its own name in `og:title` and
its banner in `og:image`. A password-protected event is expected to keep the
generic card.

## Deployment

The app deploys to Cloudflare Pages with a D1 database and R2 bucket.

**1. Create the D1 database**

```bash
npx wrangler d1 create simple-events-db
```

Update `wrangler.toml` with the returned `database_id`.

**2. Apply the database migrations**

Migrations live in `migrations/d1/` and are tracked by Wrangler (see `migrations_dir`
in `wrangler.toml`), so applying them is idempotent: only unapplied files run.

```bash
npx wrangler d1 migrations apply simple-events-db --remote
```

**Re-run this whenever a change adds a migration, before deploying that change**,
and to the preview database too (see below). Deploying code
that references a column the database does not have yet makes the affected endpoints
fail with a generic `500 Internal error`; the real cause (`no such column`) only
appears in the Worker logs (`npx wrangler pages deployment tail`).

Applying a migration ahead of its deploy is safe when it only adds columns: the
running code selects and inserts explicit column lists and ignores anything new.
A migration that drops or renames a column (as `0005` did) is not: deploy the
code that stops using the column first, then apply the migration.

**Preview deployments have their own database and bucket.** `wrangler.toml`
binds `simple-events-preview` (D1) and `simple-events-banners-preview` (R2) under
`[env.preview]`, so a preview branch never reads or writes real events. Apply new
migrations to both:

```bash
npx wrangler d1 migrations apply simple-events-db --remote
npx wrangler d1 migrations apply simple-events-preview --remote --env preview
```

If you fork this project, create your own pair (`npx wrangler d1 create` and
`npx wrangler r2 bucket create`) and put their names and ID in that section.

**3. Create the R2 bucket** (optional, for banner images)

```bash
npx wrangler r2 bucket create simple-events-banners
```

**4. Deploy the app**

```bash
npm run build
npx wrangler pages deploy
```

**5. Deploy the retention cleanup worker**

A separate scheduled Worker (`cleanup-worker/`) deletes events 90 days after their
date, along with their RSVPs, bring list, and banner, and sweeps orphaned banner
uploads. Deploy it once; it then runs on its own cron schedule.

```bash
cd cleanup-worker && npx wrangler deploy
```

Redeploy it whenever `server/` or `cleanup-worker/` changes; CI does not deploy it.
Its `RETENTION_DAYS` must match the one in `src/lib/myEvents.ts`, which is what
hosts are told.

**6. Turn on logs and a cron alert**

Errors are only written with `console.error`, so turn on Workers Logs for both the
Pages project and `simple-events-cleanup` (Dashboard → Workers & Pages → the
project → Settings → Observability), and add a notification for failed cron
triggers on the cleanup worker. Without it, a broken cleanup fails silently.

## Security notes

- Response hardening headers (CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`)
  are served from `public/_headers` and apply to the production Pages deployment.
- The API is same-origin and sends no CORS headers. If you ever serve the front end
  from a different origin, add an explicit `Access-Control-Allow-Origin` allow-list in
  `functions/api/[[route]].ts`.
- The **Your events** list is `localStorage` only: it stores each event's admin token in
  the creating browser. Admin tokens already travel in URLs, and Markdown descriptions are
  rendered without raw HTML, so this does not open a new exfiltration path. It is a
  convenience, not a backup: clearing site data removes it, and Safari evicts local storage
  after roughly seven days without a visit.
- **Event passwords** are hashed with PBKDF2-SHA256 through WebCrypto
  (`server/password.ts`). The password is only ever sent to `POST /api/verify`,
  which returns an access token; every later request carries the token (in the
  `X-Event-Access` header or an `access_token` field), which costs one HMAC to
  check. That keeps protected events inside the Workers free plan's CPU budget,
  where bcrypt was ten times over it. The token is keyed on the stored hash, so
  changing or removing the password invalidates every token issued before.
  Events created before this change hold bcrypt hashes; each is upgraded to
  PBKDF2 the first time a guest enters the correct password.
- **Banner URLs** are only accepted in the exact form `POST /api/upload`
  returns, or as a bundled preset, and an upload is only deleted from R2 once no
  other event references it (`server/banners.ts`). Upload URLs are public, so
  without that check one host could delete another's banner by adopting its URL.
- **Rate limiting is not handled in code**, so set up a
  [rate limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/)
  after deploying. The free plan allows one rule, counted per IP, with a fixed
  10-second period and a 10-second block. Point it at the endpoints worth
  throttling (Security → WAF → Rate limiting rules):

  ```
  (http.request.method eq "POST" and http.request.uri.path in {"/api/verify" "/api/rsvp" "/api/upload" "/api/create"})
  ```

  with a limit of around 10 requests per 10 seconds, action Block. A family
  RSVPing never gets near that; a script guessing an event password is slowed
  to about one guess a second per IP. That is a speed bump rather than a wall,
  so a password is still no substitute for keeping the link private.
  Rules apply to hostnames in your Cloudflare zone, so they protect your custom
  domain but not the `*.pages.dev` address. If you use a custom domain, treat
  it as the only public address.

## Environment variables

| Variable | Description |
|---|---|
| `R2_PUBLIC_URL` | Optional. Public base URL for the R2 bucket (e.g. `https://pub-xxx.r2.dev`), set as a Pages environment variable (Settings → Variables), not a build variable: only the API reads it. If omitted, banners are served through the `/banners/[filename]` Pages Function. Uploaded banner URLs are validated against it, so changing it later means new uploads use the new base while existing events keep working until their banner is replaced. |

## License

Simple Events is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.
See the [`LICENSE`](./LICENSE) file for the full text, or read it online at
[gnu.org/licenses/agpl-3.0](https://www.gnu.org/licenses/agpl-3.0.en.html).

```
SPDX-License-Identifier: AGPL-3.0-only
```

In plain terms: you're free to view, modify, and self-host this code. The AGPL's key
condition is that if you run a modified version as a network service, you must make your
modified source code available to its users under the same license.

Copyright © 2026 Nick Söderholm
