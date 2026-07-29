import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

/** Lazy singleton — avoid throwing at import when env is missing (e.g. tsc/build). */
let _db: ReturnType<typeof createDb> | undefined;

export function getDb() {
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
