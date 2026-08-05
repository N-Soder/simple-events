/**
 * Builds the banner preset assets in `public/banner-presets/`.
 *
 *   npm run banners
 *
 * Photographs come from originals you drop in `public/banner-presets/source/`,
 * named after their preset id (`coffee.jpg`, `picnic.jpg`, ...). Those originals
 * are deliberately not committed: they are 5-15 MB each and only the built
 * output ships. The two gradients need no source and are generated every run.
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
const SOURCE_DIR = path.join(OUT_DIR, "source");

/** Mirrors BANNER_MAX_WIDTH and BANNER_ASPECT in src/lib/bannerImage.ts. */
const WIDTH = 1600;
const HEIGHT = 800;
/** The picker grid loads these, not the full banners. */
const THUMB_WIDTH = 400;
const THUMB_HEIGHT = 200;

const PHOTO_QUALITY = 82;
/** Gradients band badly at photo quality, so they get their own. */
const GRADIENT_QUALITY = 94;

const MAX_BANNER_BYTES = 200 * 1024;
const MAX_THUMB_BYTES = 20 * 1024;

/**
 * Per-photo crop and grade.
 *
 * `focusY` is where the 2:1 window sits on a taller source: 0 keeps the top
 * edge, 1 the bottom, 0.5 centres it. `focusX` does the same horizontally on a
 * wider source. Both matter more than they look: the event page crops away the
 * top and bottom thirds again at desktop width, so whatever you centre here is
 * the only part most guests see.
 *
 * `saturation` and `brightness` multiply the source. `tint` applies a light
 * colour cast at constant luminance, which is how the cooler sources get pulled
 * towards the app's warm cream background (`--background`, #FCFAF7). Stock
 * photos run louder than this product does; the numbers below are all
 * corrections in that direction, and all of them are a starting point to be
 * judged by eye rather than a measurement.
 */
const TUNING = {
  "string-lights": {
    focusY: 0.5,
    saturation: 0.88,
    brightness: 1.0,
    // The source is graded orange against teal. Warming it and dropping the
    // saturation kills the cyan without touching the bulbs.
    tint: { r: 255, g: 248, b: 236 },
  },
  embers: {
    focusY: 0.5,
    saturation: 0.82,
    brightness: 1.0,
    tint: null,
  },
  "laid-table": {
    focusY: 0.5,
    saturation: 1.0,
    brightness: 1.0,
    tint: null,
  },
  coffee: {
    // Cup and croissants sit low in the frame, so the window drops to keep them
    // inside the band the event page actually shows.
    focusY: 0.68,
    saturation: 1.0,
    brightness: 1.0,
    tint: null,
  },
  picnic: {
    focusY: 0.55,
    // The strongest correction in the set: the gingham red and the grass green
    // are both louder than anything else here.
    saturation: 0.78,
    brightness: 1.02,
    tint: { r: 255, g: 250, b: 240 },
  },
  confetti: {
    focusY: 0.5,
    saturation: 0.92,
    brightness: 1.0,
    // The source's background is a cool blue-white, which reads as grubby
    // directly above a warm cream page. This shifts it towards the cream.
    tint: { r: 255, g: 252, b: 245 },
  },
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
function cropWindow(sourceWidth, sourceHeight, focusX = 0.5, focusY = 0.5) {
  const sourceAspect = sourceWidth / sourceHeight;
  const target = WIDTH / HEIGHT;

  let width = sourceWidth;
  let height = sourceHeight;
  if (sourceAspect > target) {
    width = Math.round(sourceHeight * target);
  } else {
    height = Math.round(sourceWidth / target);
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
  const window = cropWindow(meta.width, meta.height, tuning.focusX ?? 0.5, tuning.focusY);

  let pipeline = sharp(source)
    .extract(window)
    .resize(WIDTH, HEIGHT)
    .modulate({ saturation: tuning.saturation, brightness: tuning.brightness });
  if (tuning.tint) pipeline = pipeline.tint(tuning.tint);

  await pipeline.webp({ quality: PHOTO_QUALITY }).toFile(out);
  await writeThumb(out, id, PHOTO_QUALITY);
  return { out, source: `${meta.width} x ${meta.height}` };
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
    const { source: sourceSize } = await buildPhoto(id, source, tuning);
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
    console.log(`  Drop originals named <id>.<ext> in public/banner-presets/source/ and re-run.`);
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
