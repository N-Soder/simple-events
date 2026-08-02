interface Env {
  DB: D1Database;
  R2: R2Bucket;
}

const RETENTION_DAYS = 90;
// Grace period before an unreferenced R2 object is considered orphaned. This
// protects banners uploaded moments before their event row is created.
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCleanup(env));
  },
};

async function runCleanup(env: Env): Promise<void> {
  await deleteExpiredEvents(env);
  await sweepOrphanedBanners(env);
}

async function deleteExpiredEvents(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, banner_url FROM events WHERE date(event_date) < date('now', '-${RETENTION_DAYS} days')`
  ).all<{ id: string; banner_url: string | null }>();

  if (!results || results.length === 0) {
    console.log("Cleanup: no expired events found.");
    return;
  }

  // Delete R2 banners (best-effort, don't block DB cleanup on failure)
  await Promise.allSettled(
    results
      .filter((e) => e.banner_url)
      .map((e) => {
        const r2Key = e.banner_url!.split("/").pop();
        if (!r2Key) return Promise.resolve();
        return env.R2.delete(r2Key).catch((err) => {
          console.error(`R2 delete failed for key ${r2Key}:`, err);
        });
      })
  );

  // Batch deletes in groups of 100 to stay within D1 parameter limits. Children
  // are deleted explicitly (and atomically per batch) rather than relying on
  // ON DELETE CASCADE being enabled.
  const ids = results.map((e) => e.id);
  const BATCH_SIZE = 100;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => "?").join(", ");
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM bring_commitments WHERE event_id IN (${placeholders})`).bind(...batch),
      env.DB.prepare(`DELETE FROM bring_list_items WHERE event_id IN (${placeholders})`).bind(...batch),
      env.DB.prepare(`DELETE FROM rsvps WHERE event_id IN (${placeholders})`).bind(...batch),
      env.DB.prepare(`DELETE FROM events WHERE id IN (${placeholders})`).bind(...batch),
    ]);
  }

  console.log(`Cleanup complete: deleted ${ids.length} expired event(s).`);
}

// Remove R2 objects that no event references (e.g. banners uploaded during an
// abandoned "create event" flow), skipping anything uploaded very recently.
async function sweepOrphanedBanners(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT banner_url FROM events WHERE banner_url IS NOT NULL"
  ).all<{ banner_url: string }>();

  const referenced = new Set(
    (results ?? [])
      .map((e) => e.banner_url.split("/").pop())
      .filter((k): k is string => Boolean(k))
  );

  const cutoff = Date.now() - ORPHAN_GRACE_MS;
  let cursor: string | undefined;
  let deleted = 0;

  do {
    const listing = await env.R2.list({ cursor });
    for (const obj of listing.objects) {
      if (referenced.has(obj.key)) continue;
      if (obj.uploaded.getTime() >= cutoff) continue; // too recent, may be mid-create
      try {
        await env.R2.delete(obj.key);
        deleted++;
      } catch (err) {
        console.error(`Orphan R2 delete failed for key ${obj.key}:`, err);
      }
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  if (deleted > 0) console.log(`Cleanup complete: removed ${deleted} orphaned banner(s).`);
}
