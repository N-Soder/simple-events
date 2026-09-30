import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

// Integration tests for the Pages Functions API and the cleanup worker. They
// run inside workerd with a real (local) D1 and R2, and the migrations in
// migrations/d1 applied, so they exercise the same SQL that runs in production.
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations/d1"));
  return {
    test: {
      include: ["test/api/**/*.test.ts"],
      setupFiles: ["test/api/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          miniflare: {
            compatibilityDate: "2024-09-23",
            d1Databases: ["DB"],
            r2Buckets: ["R2"],
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
