# Banner preset originals

Drop the full-resolution originals here, named after their preset id, then run:

    npm run banners

The script reads `<id>.<ext>` (any format sharp can decode), cuts the 2:1 frame
and writes `public/banner-presets/<id>.webp` plus `<id>-thumb.webp`. It does not
grade: the colour you put in is the colour that ships. Six files are expected:
`string-lights`, `embers`, `laid-table`, `coffee`, `picnic`, `confetti`. The two
gradients need no source.

Nothing in this directory is committed except this note. The originals are
5-15 MB each and only the built output ships, so keeping them out of git history
keeps a clone small. If you need them again, the source URLs are in
`public/banner-presets/CREDITS.md`.

This directory is deliberately **not** inside `public/`. Vite copies `public/`
into `dist` verbatim and cannot exclude a subdirectory, so originals kept beside
the built files were published on every deploy — 12 MB of unaltered stock photos,
which is also the one thing the licence reasoning in `docs/BANNER_PRESETS.md`
relies on this repo not doing. Do not move it back for tidiness.

Do not pre-crop or pre-resize. The script needs the headroom to place each
subject in the band the event page actually shows.
