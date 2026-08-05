/**
 * Ready-made banners a host can pick instead of uploading a photo.
 *
 * Most hosts setting up a barbecue have no banner photo to hand, and the field
 * being optional means they simply skip it. A small fixed set is the cheapest
 * fix: eight tiles, no search, no browsing UI.
 *
 * A preset is *not* an upload. It is a static file already sitting in
 * `public/banner-presets/`, so picking one writes its path straight into
 * `banner_url` and skips `POST /api/upload` entirely: no bytes leave the
 * browser, no R2 object is created, and nothing needs cleaning up later. The
 * two R2 delete paths (`functions/api` and `cleanup-worker`) recognise these
 * URLs and leave them alone.
 *
 * The files are produced by `npm run banners` from originals in
 * `banner-sources/`, which are not committed. See `docs/BANNER_PRESETS.md`.
 */

/** Directory the built assets are served from. Also the marker for `isPresetUrl`. */
export const BANNER_PRESET_DIR = "/banner-presets";

export interface BannerPreset {
  id: string;
  /** Shown under the tile, and used as the image's alt text. */
  label: string;
  /** 1600 x 800 WebP, the file that becomes `banner_url`. */
  url: string;
  /** 400 x 200 WebP, loaded by the picker grid. */
  thumbUrl: string;
}

const preset = (id: string, label: string): BannerPreset => ({
  id,
  label,
  url: `${BANNER_PRESET_DIR}/${id}.webp`,
  thumbUrl: `${BANNER_PRESET_DIR}/${id}-thumb.webp`,
});

/**
 * The set, in the order the grid shows them.
 *
 * Eight fills a 4x2 grid on desktop and 2x4 on a phone and stays scannable.
 * Choosing from eight is a decision; choosing from thirty is a task, and this
 * form is for planning a dinner, not browsing a photo library.
 *
 * The last two are generated gradients rather than photographs. They cost
 * nothing legally, weigh almost nothing, and are what a host wants when they
 * would rather have colour than someone else's party. They also give the set a
 * floor: if a photo ever has to be pulled, the feature still works.
 */
export const BANNER_PRESETS: BannerPreset[] = [
  preset("string-lights", "String lights"),
  preset("embers", "Barbecue"),
  preset("laid-table", "Dinner table"),
  preset("coffee", "Coffee and pastries"),
  preset("picnic", "Picnic"),
  preset("confetti", "Confetti"),
  preset("gradient-warm", "Warm gradient"),
  preset("gradient-cool", "Cool gradient"),
];

/**
 * True for a `banner_url` that points at a bundled preset rather than an upload.
 *
 * Mirrored in `functions/api/[[route]].ts` and `cleanup-worker/src/index.ts`,
 * which are separate bundles and cannot import from here. Keep the three in
 * step: if this prefix changes, every stored preset URL changes with it.
 */
export function isPresetUrl(bannerUrl: string | null | undefined): boolean {
  return !!bannerUrl && bannerUrl.startsWith(`${BANNER_PRESET_DIR}/`);
}
