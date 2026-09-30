// Banner URL rules shared by the API (functions/api) and the retention worker
// (cleanup-worker). Both delete R2 objects, and both must agree on which
// banner_url values point at an upload of ours and which do not.

// Banners picked from the bundled set (`src/lib/bannerPresets.ts`) are static
// files served from the Pages origin, not R2 objects: there is nothing to delete
// for them. Keep in step with BANNER_PRESET_DIR on the client.
export const BANNER_PRESET_PREFIX = "/banner-presets/";
const PRESET_PATH_RE = /^\/banner-presets\/[a-z0-9-]+\.webp$/;

// POST /api/upload names every object `<uuid>.<ext>`, so any other key shape
// was not written by us.
const UPLOAD_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|gif|webp|avif)$/;

export function isPresetBanner(bannerUrl: string | null): boolean {
  return !!bannerUrl && bannerUrl.startsWith(BANNER_PRESET_PREFIX);
}

/**
 * The R2 key an upload URL refers to, or null for a preset or anything that is
 * not one of our upload URLs. Rows written before banner_url was validated can
 * hold arbitrary strings, so this is the only safe way to turn a stored URL
 * into a key.
 */
export function uploadKeyOf(bannerUrl: string | null): string | null {
  if (!bannerUrl || isPresetBanner(bannerUrl)) return null;
  const key = bannerUrl.slice(bannerUrl.lastIndexOf("/") + 1);
  return UPLOAD_KEY_RE.test(key) ? key : null;
}

/**
 * Whether a client-supplied banner_url may be stored: a bundled preset, or an
 * upload URL in exactly the form POST /api/upload returns.
 */
export function isAllowedBannerUrl(bannerUrl: string, r2PublicUrl: string | undefined): boolean {
  if (PRESET_PATH_RE.test(bannerUrl)) return true;
  const key = uploadKeyOf(bannerUrl);
  if (!key) return false;
  return bannerUrl === uploadUrlFor(key, r2PublicUrl);
}

export function uploadUrlFor(key: string, r2PublicUrl: string | undefined): string {
  return r2PublicUrl ? `${r2PublicUrl.replace(/\/$/, "")}/${key}` : `/banners/${key}`;
}

/**
 * Whether any event other than the given ones still uses this upload.
 *
 * Upload URLs are public, so another event can point at the same object. An
 * object is only deleted once nothing else references it; otherwise one host
 * could delete another's banner by adopting its URL and then dropping it.
 */
export async function isUploadReferencedElsewhere(db: D1Database, key: string, excludeEventIds: string[]): Promise<boolean> {
  const placeholders = excludeEventIds.map(() => "?").join(", ");
  const exclude = excludeEventIds.length > 0 ? ` AND id NOT IN (${placeholders})` : "";
  // Matching on the key suffix covers both the relative and the R2_PUBLIC_URL
  // form. Keys hold no LIKE wildcards (UPLOAD_KEY_RE).
  const row = await db
    .prepare(`SELECT 1 FROM events WHERE banner_url LIKE ?${exclude} LIMIT 1`)
    .bind(`%/${key}`, ...excludeEventIds)
    .first();
  return row !== null;
}

/** Delete an event's upload unless another event still uses it. Best-effort. */
export async function deleteUploadIfUnreferenced(
  db: D1Database,
  r2: R2Bucket,
  bannerUrl: string | null,
  excludeEventIds: string[],
): Promise<void> {
  const key = uploadKeyOf(bannerUrl);
  if (!key) return;
  try {
    if (await isUploadReferencedElsewhere(db, key, excludeEventIds)) return;
    await r2.delete(key);
  } catch (error) {
    console.error(`R2 cleanup failed for key ${key}:`, error);
  }
}
