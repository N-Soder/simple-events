/**
 * Builds the banner preset assets in `public/banner-presets/`.
 *
 *   npm run banners
 *
 * Photographs come from originals you drop in `banner-sources/`, named after
 * their preset id (`coffee.jpg`, `picnic.jpg`, ...). Those originals are
 * deliberately not committed and deliberately not under `public/`: they are
 * 5-15 MB each and only the built output ships. The two gradients need no
 * source and are generated every run.
 *
 * Why a script rather than hand-edited files: the crop and the grade are the
 * whole job here, and both need tuning by eye. Having them as numbers in one
 * place means you can nudge `focusY` or `saturation`, re-run, and look again,
 * instead of redoing an export in an image editor and losing what you did last
 * time. `TUNING` below is the record of those decisions.
 *
 * Everything about the output shape is dictated by how the banner is displayed.
 * See `docs/BANNER_PRESETS.md`, and read the note on the centre band before
 * changing any crop.
 */

import { mkdir, readdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public/banner-presets");
/**
 * Outside `public/` on purpose. Vite copies `public/` into `dist` verbatim, with
 * no way to exclude a subdirectory, so originals kept next to the output were
 * published on every deploy: 12 MB of unaltered stock photos at
 * `/banner-presets/source/<id>.jpg`. Gitignoring them is not enough.
 */
const SOURCE_DIR = path.join(ROOT, "banner-sources");

/** Mirrors BANNER_MAX_WIDTH and BANNER_ASPECT in src/lib/bannerImage.ts. */
const WIDTH = 1600;
const HEIGHT = 800;
/** The picker grid loads these, not the full banners. */
const THUMB_WIDTH = 400;
const THUMB_HEIGHT = 200;

const PHOTO_QUALITY = 82;
/**
 * Thumbs are only ever drawn at 400x200 in the picker grid, so they carry more
 * compression than the banner without it being visible. At PHOTO_QUALITY the
 * two noisiest sources (embers, picnic) came out over the 20 KB budget.
 */
const THUMB_QUALITY = 74;
/** Gradients band badly at photo quality, so they get their own. */
const GRADIENT_QUALITY = 94;

const MAX_BANNER_BYTES = 200 * 1024;
const MAX_THUMB_BYTES = 20 * 1024;

/**
 * Per-photo crop. Nothing here grades: every photo ships as shot.
 *
 * `focusY` is where the 2:1 window sits on a taller source: 0 keeps the top
 * edge, 1 the bottom, 0.5 centres it. `focusX` does the same horizontally on a
 * wider source. Both matter more than they look: the event page crops away the
 * top and bottom thirds again at desktop width, so whatever you centre here is
 * the only part most guests see.
 *
 * `zoom` shrinks that window before it is placed, so the subject fills more of
 * the frame. Only `coffee` needs it, and it needs it because `focusY` cannot
 * help: its subject sits in the bottom third of a 3:2 source, while a
 * full-width 2:1 window can only slide by a quarter of the source height. Keep
 * `zoom` as low as the composition allows — the window must stay at least
 * 1600 px wide or the output is upscaled, and the script fails if it is.
 *
 * There is no grade on any of these, on purpose. `saturation` and `brightness`
 * are still read if you add them, and multiply the source, but the set ships
 * without them: the photographs were chosen for their subject, and correcting
 * them towards a house style was a guess about a problem nobody had reported.
 * If one ever does look loud on the page, add the knob to that one photo only.
 *
 * There is deliberately no colour-cast knob at all. An earlier version warmed
 * the cooler sources towards the app's cream background (`--background`,
 * #FCFAF7) with sharp's `.tint()`, which does not do that: it maps the image
 * onto a single hue, so a near-white tint is a greyscale conversion. It cost
 * `string-lights`, `picnic` and `confetti` about 85% of their chroma and all
 * three shipped monochrome. If a cast is ever genuinely wanted, it is
 * `.linear([r, g, b], [0, 0, 0])` with per-channel gains — a white-point move,
 * which preserves hue relationships — and not `.tint()`.
 */
const TUNING = {
  "string-lights": { focusY: 0.5 },
  embers: { focusY: 0.5 },
  "laid-table": {
    // The wine glass is the tallest thing in the frame and the eye goes to it,
    // so the band has to contain its rim. Centred, the rim sat above the band
    // and the glass read as a stem. 0.2 puts the rim exactly on the band's top
    // edge; this keeps a margin without pulling the dark top of the source in.
    focusY: 0.1,
  },
  coffee: {
    // The only photo needing a tighter window. Cup and croissants sit in the
    // bottom third of a 3:2 source, so the widest 2:1 window cannot reach them
    // however far focusY slides: it leaves the cup below the centre band and
    // fills the band with background bokeh.
    //
    // Chosen off a sweep of 1.0 to 1.87. Centring the cup in the band would
    // take about 1.87, because the window is bottom-anchored and the cup's
    // centre sits at source y≈1620 — but at that zoom the band is a macro shot
    // of a rim and stops reading as coffee at all. 1.4 is the compromise: the
    // cup is big and legible left of centre, the croissants hold the right, and
    // the base of the cup falling below the band costs nothing. Past 1.55 the
    // rim itself gets cropped.
    zoom: 1.4,
    // Bottom-anchored: the subject is the bottom edge of the source.
    focusY: 1.0,
    // Left of centre, which puts the cup at about a third across and lets the
    // croissants hold the right half.
    focusX: 0.43,
  },
  picnic: {
    // Top-anchored, because the open lid is the top of the subject and the band
    // has to contain it. At 0.1 the wicker edge is already gone; at the old 0.55
    // the band was blanket and grass with the hamper cut off above it.
    focusY: 0,
    // Grass and gingham are both fine high-frequency detail, which is the most
    // expensive thing a WebP encoder can be handed: at the shared quality this
    // one photo lands just over the 200 KB budget. It was under it before only
    // because a saturation cut was throwing away detail as a side effect. This
    // pays for the size directly instead, where it is visible in the diff.
    quality: 78,
  },
  confetti: { focusY: 0.5 },
};

/**
 * The two gradients, as SVG.
 *
 * Both run on the same diagonal and are built from the app's own palette, so
 * they read as part of the product rather than as decoration. The off-centre
 * radial lift is there so they do not look like a flat CSS default; it is meant
 * to be barely perceptible.
 */
const GRADIENTS = {
  "gradient-warm": {
    // --accent (#F9F0E7) through to a deeper version of the same warmth.
    stops: ["#F9F0E7", "#EFD8C4", "#D9B79A"],
    highlight: "#FFFFFF",
  },
  "gradient-cool": {
    // Ends on --primary (#358C61), the app's green.
    stops: ["#EAF2EE", "#9EC6B4", "#358C61"],
    highlight: "#FFFFFF",
  },
};

function gradientSvg({ stops, highlight }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${stops[0]}" />
      <stop offset="55%" stop-color="${stops[1]}" />
      <stop offset="100%" stop-color="${stops[2]}" />
    </linearGradient>
    <radialGradient id="lift" cx="0.32" cy="0.28" r="0.7">
      <stop offset="0%" stop-color="${highlight}" stop-opacity="0.22" />
      <stop offset="100%" stop-color="${highlight}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#lift)" />
</svg>`;
}

/**
 * The 2:1 window on a source of any shape, placed by `focusX` / `focusY`.
 *
 * Done by hand rather than with sharp's `fit: "cover"` because cover only
 * anchors to an edge or the centre, and two of these six need to sit somewhere
 * in between.
 */
function cropWindow(sourceWidth, sourceHeight, { focusX = 0.5, focusY = 0.5, zoom = 1 }) {
  const sourceAspect = sourceWidth / sourceHeight;
  const target = WIDTH / HEIGHT;

  let width = sourceWidth;
  let height = sourceHeight;
  if (sourceAspect > target) {
    width = Math.round(sourceHeight * target);
  } else {
    height = Math.round(sourceWidth / target);
  }

  if (zoom !== 1) {
    width = Math.round(width / zoom);
    // Derived from the width rather than scaled independently, so rounding
    // cannot walk the window off 2:1.
    height = Math.round(width / target);
  }

  const clamp = (value, max) => Math.max(0, Math.min(Math.round(value), max));
  return {
    left: clamp((sourceWidth - width) * focusX, sourceWidth - width),
    top: clamp((sourceHeight - height) * focusY, sourceHeight - height),
    width,
    height,
  };
}

async function findSource(id) {
  if (!existsSync(SOURCE_DIR)) return null;
  const entries = await readdir(SOURCE_DIR);
  const match = entries.find((name) => path.parse(name).name === id);
  return match ? path.join(SOURCE_DIR, match) : null;
}

async function writeThumb(fullSizePath, id, quality) {
  const out = path.join(OUT_DIR, `${id}-thumb.webp`);
  await sharp(fullSizePath)
    .resize(THUMB_WIDTH, THUMB_HEIGHT)
    .webp({ quality })
    .toFile(out);
  return out;
}

async function buildGradient(id, spec) {
  const out = path.join(OUT_DIR, `${id}.webp`);
  await sharp(Buffer.from(gradientSvg(spec)))
    .webp({ quality: GRADIENT_QUALITY })
    .toFile(out);
  await writeThumb(out, id, GRADIENT_QUALITY);
  return out;
}

async function buildPhoto(id, source, tuning) {
  const out = path.join(OUT_DIR, `${id}.webp`);
  const meta = await sharp(source).metadata();
  const window = cropWindow(meta.width, meta.height, tuning);

  let pipeline = sharp(source).extract(window).resize(WIDTH, HEIGHT);
  // Opt-in, and currently opted into by nothing: an absent knob means the photo
  // ships as shot rather than passing through a no-op modulate.
  if (tuning.saturation !== undefined || tuning.brightness !== undefined) {
    pipeline = pipeline.modulate({
      saturation: tuning.saturation ?? 1,
      brightness: tuning.brightness ?? 1,
    });
  }

  await pipeline.webp({ quality: tuning.quality ?? PHOTO_QUALITY }).toFile(out);
  await writeThumb(out, id, THUMB_QUALITY);
  return { out, source: `${meta.width} x ${meta.height}`, window };
}

async function describe(file) {
  const { size } = await stat(file);
  const { width, height, format } = await sharp(file).metadata();
  return { size, width, height, format };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const rows = [];
  const problems = [];
  const missing = [];

  for (const [id, spec] of Object.entries(GRADIENTS)) {
    await buildGradient(id, spec);
    rows.push([id, "generated"]);
  }

  for (const [id, tuning] of Object.entries(TUNING)) {
    const source = await findSource(id);
    if (!source) {
      missing.push(id);
      continue;
    }
    const { source: sourceSize, window } = await buildPhoto(id, source, tuning);
    // Cropping below the output width means sharp is scaling up, which no
    // amount of quality setting recovers. Easy to cause by nudging `zoom`.
    if (window.width < WIDTH) {
      problems.push(
        `${id}: crop window is ${window.width} px wide, upscaled to ${WIDTH}; lower zoom`,
      );
    }
    rows.push([id, `from ${path.basename(source)} (${sourceSize})`]);
  }

  console.log("");
  for (const [id, note] of rows) {
    for (const suffix of ["", "-thumb"]) {
      const file = path.join(OUT_DIR, `${id}${suffix}.webp`);
      const { size, width, height, format } = await describe(file);
      const isThumb = suffix === "-thumb";
      const budget = isThumb ? MAX_THUMB_BYTES : MAX_BANNER_BYTES;
      const expected = isThumb ? [THUMB_WIDTH, THUMB_HEIGHT] : [WIDTH, HEIGHT];

      if (width !== expected[0] || height !== expected[1]) {
        problems.push(`${id}${suffix}: ${width} x ${height}, expected ${expected.join(" x ")}`);
      }
      if (format !== "webp") problems.push(`${id}${suffix}: format is ${format}, not webp`);
      if (size > budget) problems.push(`${id}${suffix}: ${kb(size)} is over the ${kb(budget)} budget`);

      console.log(
        `  ${`${id}${suffix}`.padEnd(24)} ${`${width} x ${height}`.padEnd(12)} ${kb(size).padStart(9)}` +
          (isThumb ? "" : `   ${note}`),
      );
    }
  }

  if (missing.length) {
    console.log(`\n  Not built, no source file: ${missing.join(", ")}`);
    console.log(`  Drop originals named <id>.<ext> in banner-sources/ and re-run.`);
  }

  if (problems.length) {
    console.log("\n  Problems:");
    for (const problem of problems) console.log(`    ${problem}`);
  } else {
    console.log("\n  Every built asset is within spec.");
  }

  // A missing source is a failure, not a warning: the picker lists all eight
  // presets, so a half-built set means broken tiles.
  if (problems.length || missing.length) process.exitCode = 1;
}

await main();
