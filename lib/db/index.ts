import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

type AppDb = ReturnType<typeof createDb>;

/** Lazy singleton — avoid throwing at import when env is missing (e.g. tsc/build). */
let _db: AppDb | undefined;

/**
 * Integration tests (pglite) inject a DB here so queries use in-process Postgres
 * without a Neon DATABASE_URL. Production code never calls this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _testDb: any | undefined;

export function setTestDb(db: unknown | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setTestDb is not available in production");
  }
  _testDb = db ?? undefined;
}

export function getDb() {
  // Test inject only outside production (DCE-friendly for prod bundles).
  if (process.env.NODE_ENV !== "production" && _testDb) {
    return _testDb as AppDb;
  }
  if (!_db) _db = createDb();
  return _db;
}

/** Convenience alias for server code that assumes env is configured. */
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export * from "./schema";
