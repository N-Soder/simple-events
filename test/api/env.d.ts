declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    R2: R2Bucket;
    TEST_MIGRATIONS: D1Migration[];
  }
}
