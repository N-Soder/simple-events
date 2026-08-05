# Banner presets

Hosts can upload a banner photo (`src/components/BannerField.tsx`). Most of them
have none to hand, so the field gets skipped and the event page loses its only
piece of colour. The fix is a small fixed set of ready-made banners to pick from.

This document is why the set is what it is, and how to rebuild it.

---

## 1. What ships

Eight presets, listed in `src/lib/bannerPresets.ts`, served as static files from
`public/banner-presets/`:

| id | Subject |
| --- | --- |
| `string-lights` | Festoon lights at dusk |
| `embers` | Barbecue |
| `laid-table` | Dinner table |
| `coffee` | Coffee and pastries |
| `picnic` | Hamper on a gingham blanket |
| `confetti` | Confetti flat-lay |
| `gradient-warm` | Generated, from `--accent` |
| `gradient-cool` | Generated, ending on `--primary` |

Eight fills a 4x2 grid on desktop and 2x4 on a phone and stays scannable.
Choosing from eight is a decision; choosing from thirty is a task, and this form
is for planning a dinner rather than browsing a photo library. The six subjects
were picked to spread across what people actually use this for (birthdays,
barbecues, dinners, brunch, picnics, celebrations) without repeating a mood.

The last two are gradients rather than photographs on purpose. They cost nothing
legally, weigh almost nothing, and are what a host wants when they would rather
have colour than someone else's party. They also give the set a floor: if a photo
ever has to be pulled, the feature still works.

---

## 2. Where the photographs come from, and the licence reasoning

All six are from [Pexels](https://www.pexels.com/), under the
[Pexels licence](https://www.pexels.com/license/).

The question that mattered was not "may we display these" (every free stock site
allows that) but "may we ship the files themselves in an AGPL repo that gets
cloned and forked". The Pexels restriction people reach for reads:

> Don't redistribute or sell the photos and videos on other stock photo or
> wallpaper platforms.

That is scoped to stock photo and wallpaper platforms. This is an event page app,
nothing is sold, and every file is cropped, graded and re-encoded before it ships,
so it is not an unaltered copy either. Bundling them is within the licence.

Two other clauses do shape the set, and neither is about redistribution:

- **"Don't imply endorsement of your product by people or brands on the
  imagery."** This is the real reason **no preset contains a recognisable face**.
  A copyright licence from Pexels says nothing about the depicted person's own
  rights, and a face in a product's UI is exactly the endorsement-shaped use that
  clause names. Two candidates were dropped over this: a concert crowd with an
  identifiable performer, and a golden-hour park shot with a dozen identifiable
  people. Hold any replacement to the same line.
- **No logos, and no text or numbers in frame.** A gold-balloon shot spelling out
  `21` and `party` was dropped for this. Lettering also gets sliced mid-word by
  the desktop crop below, and the host's own title is doing that job anyway.

Pexels can withdraw a photo, and git history cannot. That is hygiene rather than a
licence problem, and it is why `public/banner-presets/CREDITS.md` records a source
URL per file: any one preset can be swapped without re-researching the set.

### Sources considered and not used

- **Unsplash** grants an irrevocable licence to distribute, but explicitly not the
  right to compile its photos "to replicate a similar or competing service", and
  their own explainer frames that in terms of users browsing and choosing images.
  Very likely fine for eight tiles. "Very likely fine" is a bad thing to hand to
  every downstream fork.
- **Pixabay** forbids redistributing content on a standalone basis, which is
  harder to argue past than the Pexels wording.
- **CC0 sources** are the cleanest of all and remain the fallback if the Pexels
  position ever looks shakier than it does: the
  [WordPress Photo Directory](https://wordpress.org/photos/) is entirely CC0 and
  already forbids faces by policy, [Openverse](https://openverse.org/) can be
  filtered to CC0, and the Met, Smithsonian and Rijksmuseum open-access
  collections are CC0 if an illustrated set is ever preferred to photographs.
- **The Unsplash API** would be the right answer for a searchable library rather
  than a fixed set: hotlink their CDN, mandatory attribution, trigger the
  `download_location` endpoint, 50 requests/hour until approved for production.
  It needs a server-side key, which self-hosters would not have, so the feature
  would silently die for them. Worth revisiting only if hosts say eight is too
  few.

---

## 3. The crop that dictates every composition

The banner renders as a full-viewport-width band, `h-56 sm:h-72`, with
`object-cover` (`src/pages/EventPage.tsx`). The event title sits below the band,
not on it, so no clear space for text is needed. But the crop is severe and
asymmetric:

- **Desktop, ~1440 px wide:** the band is effectively 5:1. A 2:1 image is scaled
  to the band's width, so roughly the top 30% and bottom 30% are cut away. Only
  the centre horizontal third survives.
- **Mobile, ~390 px wide:** the band is roughly 1.74:1, so about 13% is cut from
  each side.

So the subject belongs in the centre band of the 1600 x 800 frame, roughly
y = 240 to y = 560, and the outer ~200 px of each side has to be non-essential.
The whole 2:1 frame is still shown in two places, the picker preview and the
`og:image` link-preview card, so it also has to look composed rather than
letterboxed.

`focusY` in the build script is what places that window. Two of the six needed it
away from centre.

---

## 4. Rebuilding the assets

    npm run banners

Reads originals from `public/banner-presets/source/<id>.<ext>` and writes
`public/banner-presets/<id>.webp` (1600 x 800, WebP q82, under 200 KB) plus
`<id>-thumb.webp` (400 x 200, under 20 KB). The gradients need no source and are
regenerated every run. The script reports dimensions and sizes for everything it
produced and exits non-zero if anything is out of spec or missing.

The originals are **not committed** (see `.gitignore`): they are 5-15 MB each and
only the built output ships. `public/banner-presets/source/README.md` says what
goes in there, and `CREDITS.md` has the URLs to fetch them again.

Crop and grade live in the `TUNING` object at the top of
`scripts/build-banner-presets.mjs`, one entry per photo. They are corrections in
one direction: stock photos run louder than this product does, so the numbers pull
saturation down and colour temperature towards the app's warm cream background.
They are a starting point to be judged by eye, not measurements. Nudge, re-run,
look again.

Sizing mirrors the upload path (`BANNER_MAX_WIDTH`, `BANNER_ASPECT` in
`src/lib/bannerImage.ts`) so a preset and an uploaded photo render identically.

---

## 5. How a preset differs from an upload

A preset is not an upload, and that is most of its appeal:

- Picking one writes its path straight into `banner_url` and **skips
  `POST /api/upload` entirely**. No bytes leave the browser, no R2 object is
  created, nothing needs cleaning up later.
- `BannerField` reports its choice as a `BannerChoice`, either `{ kind: "file" }`
  or `{ kind: "preset" }`, and `CreateEvent` uploads only in the first case.
- The crop dialog and the details popover are hidden for presets. They are already
  the right aspect ratio, and the host did not choose the file, so its size is not
  theirs to account for.
- Both R2 delete paths recognise preset URLs and leave them alone: the
  `admin/delete-event` handler in `functions/api/[[route]].ts`, and both
  `deleteExpiredEvents` and `sweepOrphanedBanners` in `cleanup-worker`. Deleting
  the key a preset path ends in would be a harmless no-op today, since upload keys
  are UUIDs, but relying on that is one rename away from deleting a real object.
- Social previews need no special handling: `functions/event/[id].ts` already
  resolves a relative `banner_url` against the page URL before putting it in
  `og:image`.

The prefix `/banner-presets/` is the marker for all of this, and it is duplicated
in three places (`src/lib/bannerPresets.ts`, `functions/api/[[route]].ts`,
`cleanup-worker/src/index.ts`) because those are separate bundles that cannot
import from each other. The repo already does this for `MAX_BANNER_BYTES`. Keep
them in step.

It deliberately does **not** live under `/banners/`, which is the fallback shape
for R2-backed uploads. Cloudflare Pages serves real static files ahead of the
`/*  /index.html  200` rewrite in `public/_redirects`, so files on disk resolve
before the SPA catch-all.

---

## 6. Open questions

- Nothing records whether a host picked a preset or uploaded their own, so we
  cannot tell which tiles earn their place. There is nowhere to put that short of
  a new column, and the project keeps no analytics, so the honest answer may be
  "we will never know" — which is an argument for keeping the set small and
  opinionated rather than growing it on a hunch.
- Two of the six (`laid-table`, `picnic`) have wine visible, so the set skews
  faintly adult. Hosts pick, so it is not a problem, but a kids'-party subject
  would be the first addition if the set ever grows.
- Bench of alternates, already researched, if one has to be replaced: night sky at
  dusk, glasses being poured, pool or water, autumn leaves, flowers, board games
  on a table.
