interface Env {
  DB: D1Database;
  R2: R2Bucket;
}

const RETENTION_DAYS = 90;

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCleanup(env));
  },
};

async function runCleanup(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, banner_url FROM events WHERE date(event_date) < date('now', '-${RETENTION_DAYS} days')`
  ).all<{ id: string; banner_url: string | null }>();

  if (!results || results.length === 0) {
    console.log("Cleanup: no expired events found.");
    return;
  }

  // Delete R2 banners (best-effort — don't block DB cleanup on failure)
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

  // Batch deletes in groups of 100 to stay within D1 parameter limits
  const ids = results.map((e) => e.id);
  const BATCH_SIZE = 100;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => "?").join(", ");
    await env.DB.prepare(
      `DELETE FROM events WHERE id IN (${placeholders})`
    ).bind(...batch).run();
  }

  console.log(`Cleanup complete: deleted ${ids.length} expired event(s).`);
}
