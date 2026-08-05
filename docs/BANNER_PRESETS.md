# Banner presets: research

Hosts can already upload a banner photo (`src/components/BannerField.tsx`). Most
of them will not have one to hand. This is the research behind offering a small
set of ready-made banners to pick from instead, covering where the images can
legally come from, how many to ship, and what they should be of.

No code has been written yet. This document is the decision record that the
implementation should follow.

---

## 1. The constraint that decides everything

This repo is AGPL-3.0 and self-hostable. Anything we ship in `public/` is
**redistributed**: to every fork, every clone, every self-hoster, in a public
git history, forever. That is a much stronger requirement than "we are allowed
to use this image on our site", which is all most free-stock licences grant.

Two separate questions, and they have different answers:

1. **May we display the image in our product?** Almost every free stock site
   says yes.
2. **May we ship the image file itself, as part of a set, in a redistributable
   open-source repo?** Only public-domain / CC0 sources say yes cleanly.

A second constraint, easy to miss: no free stock site provides **model
releases**. A model release is what makes it safe to use a recognisable
person's face to promote something. Without one, a photo of an identifiable
person baked into our product is the riskiest thing on this list, and it is
risky in a way that scales with the project rather than with us. Preset banners
should contain **no recognisable faces**. This turns out to be easy, and it also
makes for better banners: a preset is a backdrop, and a stranger's face staring
out of the top of your barbecue invite is worse design anyway.

---

## 2. Sources

### Recommended: CC0 / public domain, bundled as static assets

| Source | Licence | Why it fits |
| --- | --- | --- |
| [WordPress Photo Directory](https://wordpress.org/photos/) | CC0 | Best single fit. Every submission is CC0, and the [guidelines](https://wordpress.org/photos/guidelines/) forbid faces and anything identifying a person or private location, which is exactly our rule already enforced upstream. Curated, modern, and photographic rather than arty. |
| [Openverse](https://openverse.org/) | Filterable, set it to CC0 | Aggregates ~800M openly licensed files across sources, with a licence filter. Use it to fill gaps the WordPress directory cannot, then verify the licence at the original source rather than trusting the index. |
| [Met Open Access](https://www.metmuseum.org/hubs/open-access), [Smithsonian Open Access](https://www.si.edu/openaccess), [Rijksmuseum Rijksstudio](https://www.rijksmuseum.nl/en/rijksstudio) | CC0 | ~375k, ~4.5M and ~800k CC0 images respectively. Not for "photo of a barbecue", but excellent for the illustrated or vintage options in the set (botanical prints, star charts, patterned textiles). High resolution, no faces needed, and impossible to argue with legally. |
| [Public Domain Review](https://publicdomainreview.org/collections/) | Public domain (check per item) | Curated route into the same museum material when you want taste rather than search results. |

CC0 has no attribution requirement. We should credit anyway, in the repo rather
than in the UI: a `public/banner-presets/CREDITS.md` listing source URL,
photographer or institution, and licence for each file. That is what makes the
set auditable by a self-hoster, and what lets us swap one image without
re-researching the other seven.

### Deliberately not recommended for bundling: Unsplash, Pexels, Pixabay

These are the obvious first thought and they are the wrong tool for a bundled
set. Not because using them is forbidden in general, but because each one has a
clause aimed squarely at what a preset picker looks like from the outside.

- **Unsplash.** The [licence](https://unsplash.com/license) is generous: an
  "irrevocable, nonexclusive, worldwide copyright license to download, copy,
  modify, distribute, perform, and use" photos, commercially, without
  attribution. But it explicitly does not grant the right to compile Unsplash
  photos "to replicate a similar or competing service", and the
  [help centre](https://help.unsplash.com/en/articles/2612332-what-do-you-mean-by-compiling-photos-to-replicate-a-similar-or-competing-service)
  describes that in terms of users browsing and choosing images. Eight photos in
  a picker is not a stock service, and we would very likely be fine. "Very
  likely fine" is a bad thing to hand to every downstream fork.
- **Pexels.** The [licence](https://www.pexels.com/license/) says plainly: do
  not redistribute the photos on other platforms, and do not sell unaltered
  copies. Shipping the files in a repo is redistribution.
- **Pixabay.** Content uploaded after 9 January 2019 falls under the
  [Content License](https://pixabay.com/service/license-summary/), which forbids
  redistributing content on a standalone basis. Same problem, stated more
  directly.

### If we ever want a searchable library instead of a fixed set

Then the Unsplash API is the right answer, and its rules become workable
because we would no longer be bundling anything. The
[API guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines)
require three things: hotlink their CDN URLs rather than re-hosting, credit the
photographer and Unsplash with a link back (attribution is *not* optional on the
API, unlike the plain licence), and hit the `download_location` endpoint when a
user picks a photo. Rate limits are 50 requests/hour in demo mode and 5,000/hour
once approved for production.

Three reasons this is the wrong first move here:

1. It needs a server-side key and a proxy route, so it is real backend work.
2. Hotlinking makes every guest's page load depend on a third party, and makes
   the link-preview image (`functions/event/[id].ts`) point off-site.
3. Self-hosters would need their own Unsplash key, or the feature silently dies
   for them. A bundled CC0 set works everywhere with no configuration.

Worth revisiting only if hosts tell us eight options is too few.

---

## 3. How many, and what shape

**Eight photos plus two non-photo options.** Ten tiles total.

Reasoning:

- Eight fills a 4x2 grid on desktop and 2x4 on mobile, and stays scannable at a
  glance. Choosing from eight is a decision; choosing from thirty is a task, and
  the design guide's "occasions, not admin" rule says the form should not grow a
  browsing UI.
- Eight also covers the real spread of events this app gets used for without
  duplicating moods (see the list below).
- The two non-photo options are generated gradients or soft patterns, drawn from
  the existing palette in `src/index.css`. They cost nothing legally, weigh
  almost nothing, and are what a host wants when they would rather have colour
  than a stock photo. They also give the set a floor: if we ever have to pull a
  photo, the feature still works.

Sizing follows what the upload path already produces, so presets and uploads
render identically:

- Store at **1600x800** (the 2:1 `BANNER_ASPECT`, at `BANNER_MAX_WIDTH`), WebP
  at quality ~0.82, which lands around 80-140 KB each.
- Ship a **~400x200 thumbnail** per preset for the picker grid, around 10-20 KB.
  Only thumbnails load when the picker is open, so the grid costs roughly 150 KB
  total and the full banner is fetched only for the one that gets chosen.

---

## 4. What the eight should be of

The brief for each is "a backdrop that flatters a title", not "a picture of the
event". No faces, no legible brand logos, no text in the image, nothing so
literal that it fights the host's own words. Shot wide, with a calm area
somewhere for the title to sit over.

| # | Preset | Covers | What to search for |
| --- | --- | --- | --- |
| 1 | **String lights at dusk** | Birthdays, drinks, garden parties, engagements | "festoon lights", "fairy lights bokeh", "garden lights evening" |
| 2 | **Laid table from above** | Dinner parties, potlucks, Sunday lunch, supper clubs | "table setting overhead", "flat lay dinner table", "cutlery linen" |
| 3 | **Grill or fire** | Barbecues, cookouts, bonfire nights | "barbecue coals", "campfire embers", "grill flames close up" |
| 4 | **Park grass and picnic blanket** | Picnics, kids' parties, sports days, meetups | "picnic blanket grass", "park summer afternoon", "meadow blanket" |
| 5 | **Glasses and pours** | Drinks, housewarmings, launches, anniversaries | "cocktail glasses bar", "sparkling wine pour", "glassware backlit" |
| 6 | **Confetti or balloons on colour** | Birthdays, graduations, celebrations generally | "confetti on pastel", "balloons plain background", "streamers colour" |
| 7 | **Coffee and pastries** | Brunch, baby showers, book clubs, morning things | "coffee cups table", "pastries flat lay", "cafe morning light" |
| 8 | **Night sky or dusk gradient** | Late events, NYE, gigs, anything after dark | "night sky stars", "dusk gradient sky", "twilight horizon" |

Plus:

- **9. Warm gradient**, generated from the palette.
- **10. Cool gradient**, likewise. Pattern rather than plain if plain reads
  cheap next to the photos.

Alternates worth having researched but not shipping in v1: pool or water,
autumn leaves, snow and pine, board games on a table, flowers, sports pitch
lines. If we later learn what hosts actually create, swap from this bench rather
than adding tiles.

The illustrated route is the interesting fallback if the photo set feels too
stock: eight CC0 museum images (a botanical plate, a star chart, a Japanese
woodblock landscape, a patterned textile) would look more distinctive than any
free photo set and carry zero licence doubt. Worth mocking up one tile of each
before committing.

---

## 5. Implementation notes

Grounded in what is already here, so whoever picks this up does not have to
rediscover it.

- **Presets need no upload and no R2 object.** `banner_url` is a free-text
  column (`migrations/d1/0001_initial.sql`) that the event page and the social
  preview both read as a URL. A preset is just a stable static path, so picking
  one skips `POST /api/upload` entirely: no bytes uploaded, no R2 storage, no
  cleanup obligation.
- **Serve them from `public/banner-presets/`, not `public/banners/`.**
  `/banners/<key>` is already the fallback shape for R2-backed uploads
  (`functions/api/[[route]].ts`). Keeping the namespaces separate stops a preset
  path ever being mistaken for an R2 key. Cloudflare Pages serves real static
  files ahead of the `/*  /index.html  200` rewrite in `public/_redirects`, so a
  file on disk resolves before the SPA catch-all.
- **Check the two R2 delete paths.** Both `DELETE /api/admin/delete-event` and
  the cleanup worker's `deleteExpiredEvents` do `banner_url.split("/").pop()`
  and delete that as an R2 key. For a preset that is a harmless no-op (deleting
  a missing key succeeds, and upload keys are UUIDs so they cannot collide), but
  it should skip the call explicitly rather than rely on that. Same for
  `sweepOrphanedBanners`, where preset filenames would land in the `referenced`
  set and match nothing.
- **Social previews already work.** `functions/event/[id].ts` resolves a
  relative `banner_url` against the page URL before putting it in `og:image`, so
  a preset path becomes an absolute URL for crawlers with no extra work.
- **The CSP allows both.** `img-src 'self' data: blob: https:` in
  `public/_headers` covers same-origin presets and the existing blob previews.
- **Where it goes in the UI.** `BannerField` currently has one empty state (the
  drop zone). The presets belong behind a secondary action next to it rather
  than always-open above it, so a host who has a photo is not made to scroll
  past a gallery. Picking a preset should land in the same `picked` state as an
  upload, minus the crop affordance (they are already the right aspect ratio)
  and minus the details popover (there is nothing to explain about a file the
  host did not choose the size of).
- **Ship the credits file** at `public/banner-presets/CREDITS.md`: filename,
  source URL, creator or institution, licence. It is not legally required under
  CC0, but it is what makes the set maintainable and auditable.

---

## 6. Open questions

- Do we want photos or the illustrated museum route? Mock one tile of each
  before deciding. This is a taste call, not a research call.
- Should a preset be recorded distinctly from an upload, so we can tell later
  which presets get used and which are dead weight? There is nowhere to put that
  today short of a new column, and the project keeps no analytics, so the honest
  answer may be "we will never know", which is an argument for keeping the set
  small and opinionated.
