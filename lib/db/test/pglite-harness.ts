/**
 * pglite test DB for ownership / authz integration tests.
 * Spike goal: prove roux schema + generated tsvector work in-process.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";

const here = dirname(fileURLToPath(import.meta.url));
const DDL = readFileSync(join(here, "roux-ddl.sql"), "utf8");

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export async function createPgliteDb(): Promise<{
  client: PGlite;
  db: TestDb;
}> {
  const client = new PGlite();
  // Multi-statement DDL
  await client.exec(DDL);
  const db = drizzle({ client, schema });
  return { client, db };
}
