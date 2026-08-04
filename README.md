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
- Optional password protection
- Control guest list visibility: full names, count only, or hidden
- Optional bring list: define items with quantities so guests can claim what they'll bring
- Admin dashboard to view all RSVPs, manage bring list items, and delete entries
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
- **Cropping is optional** (`BannerCropDialog`): a 2:1 frame with drag, pinch, and a
  zoom slider. Every crop re-encodes from the original file, so adjusting a crop
  twice does not stack two generations of lossy encoding.
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
| Data fetching | TanStack React Query |
| Backend | Cloudflare Pages Functions |
| Database | Cloudflare D1 (SQLite) |
| File storage | Cloudflare R2 (banner images) |

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
npm run test       # run tests with Vitest
```

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
including for preview deployments, which share the same D1 database. Deploying code
that references a column the database does not have yet makes the affected endpoints
fail with a generic `500 Internal error`; the real cause (`no such column`) only
appears in the Worker logs (`npx wrangler pages deployment tail`).

Migrations here only ever add columns, so applying them ahead of a deploy is safe:
the currently running code selects and inserts explicit column lists and ignores
anything new.

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
- **Rate limiting is not handled in code.** Password-protected events and the
  upload/RSVP endpoints are otherwise open to automated abuse. Add a
  [Cloudflare Rate Limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/)
  (or a WAF rule) for `/api/verify`, `/api/event`, `/api/rsvp`, and `/api/upload` in
  the dashboard after deploying.

## Environment variables

| Variable | Description |
|---|---|
| `VITE_R2_PUBLIC_URL` | Public base URL for the R2 bucket (e.g. `https://pub-xxx.r2.dev`). If omitted, banner uploads are served through a Pages Function route instead. |

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
