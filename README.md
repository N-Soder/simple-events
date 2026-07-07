# Simple Events

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

A lightweight web app for creating private event pages and coordinating RSVPs — no accounts required. Hosts share a link; guests RSVP by name and optionally claim items from a bring list.

## Features

**For hosts**
- Create an event with name, date, time, location, and an optional Markdown description
- Upload a banner image
- Optional password protection
- Control guest list visibility: full names, count only, or hidden
- Optional bring list — define items with quantities so guests can claim what they'll bring
- Admin dashboard to view all RSVPs, manage bring list items, and delete entries

**For guests**
- No account needed — just enter your name
- RSVP with adult and kid counts
- Claim items from the bring list or add your own
- Edit or cancel your RSVP at any time via a personal manage link

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

## Deployment

The app deploys to Cloudflare Pages with a D1 database and R2 bucket.

**1. Create the D1 database**

```bash
npx wrangler d1 create simple-events-db
```

Update `wrangler.toml` with the returned `database_id`.

**2. Apply the database migrations**

Migrations live in `migrations/d1/` and are tracked by Wrangler (see `migrations_dir`
in `wrangler.toml`), so applying them is idempotent — only unapplied files run.

```bash
npx wrangler d1 migrations apply simple-events-db --remote
```

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
