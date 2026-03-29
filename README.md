# Simple Events

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

**2. Apply the database schema**

```bash
npx wrangler d1 execute simple-events-db --file=./migrations/d1/0001_initial.sql
```

**3. Create the R2 bucket** (optional, for banner images)

```bash
npx wrangler r2 bucket create simple-events-banners
```

**4. Deploy**

```bash
npm run build
npx wrangler pages deploy
```

## Environment variables

| Variable | Description |
|---|---|
| `VITE_R2_PUBLIC_URL` | Public base URL for the R2 bucket (e.g. `https://pub-xxx.r2.dev`). If omitted, banner uploads are served through a Pages Function route instead. |
