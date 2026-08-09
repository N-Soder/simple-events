import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { BANNER_PRESETS, isPresetUrl } from "./bannerPresets";

const PUBLIC_DIR = path.resolve(__dirname, "../../public");
const resolve = (url: string) => path.join(PUBLIC_DIR, url);

/**
 * The picker renders every entry in `BANNER_PRESETS`, so a manifest entry with
 * no file behind it is a broken tile in production. The assets are built by
 * `npm run banners` from originals that are not committed, which makes this easy
 * to get wrong: these tests are what stops a half-built set being merged.
 */
describe("banner preset assets", () => {
  it.each(BANNER_PRESETS)("$id has both files on disk", ({ url, thumbUrl }) => {
    expect(existsSync(resolve(url)), `missing ${url} - run npm run banners`).toBe(true);
    expect(existsSync(resolve(thumbUrl)), `missing ${thumbUrl} - run npm run banners`).toBe(true);
  });

  it.each(BANNER_PRESETS)("$id stays inside its size budget", ({ url, thumbUrl }) => {
    // Only the thumbnails load when the picker opens, so the grid costs the sum
    // of those. The full banner is fetched only for the one that gets chosen.
    expect(statSync(resolve(url)).size).toBeLessThanOrEqual(200 * 1024);
    expect(statSync(resolve(thumbUrl)).size).toBeLessThanOrEqual(20 * 1024);
  });

  it("has unique ids", () => {
    const ids = BANNER_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("isPresetUrl", () => {
  it("recognises the preset paths", () => {
    for (const preset of BANNER_PRESETS) {
      expect(isPresetUrl(preset.url)).toBe(true);
    }
  });

  it("rejects uploads and absent banners", () => {
    // The two shapes an uploaded banner_url takes: absolute when R2_PUBLIC_URL
    // is configured, relative otherwise.
    expect(isPresetUrl("https://cdn.example.com/0f9c.webp")).toBe(false);
    expect(isPresetUrl("/banners/0f9c-4b1a.webp")).toBe(false);
    expect(isPresetUrl(null)).toBe(false);
    expect(isPresetUrl(undefined)).toBe(false);
    expect(isPresetUrl("")).toBe(false);
  });

  it("is not fooled by a lookalike prefix", () => {
    expect(isPresetUrl("/banner-presets-evil/x.webp")).toBe(false);
    expect(isPresetUrl("/banners/banner-presets/x.webp")).toBe(false);
  });
});
