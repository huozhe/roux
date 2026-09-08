/**
 * Fail if pglite DDL is missing columns declared in Drizzle schema.
 * Known extras (e.g. generated `search`) are allowed.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getTableColumns, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  captionSkips,
  libraryShares,
  playlists,
  recipeGrants,
  recipeTombstones,
  recipes,
  setTestDb,
  shareLinks,
  syncRuns,
  users,
} from "@/lib/db";
import { createPgliteDb } from "@/lib/db/test/pglite-harness";

const TABLES: { name: string; table: PgTable; allowExtra?: string[] }[] = [
  { name: "users", table: users },
  { name: "playlists", table: playlists },
  { name: "recipes", table: recipes, allowExtra: ["search"] },
  { name: "share_links", table: shareLinks },
  { name: "recipe_grants", table: recipeGrants },
  { name: "library_shares", table: libraryShares },
  { name: "sync_runs", table: syncRuns },
  { name: "recipe_tombstones", table: recipeTombstones },
  { name: "caption_skips", table: captionSkips },
];

function drizzleColumnNames(table: PgTable): string[] {
  return Object.values(getTableColumns(table)).map((c) => c.name);
}

describe("DDL drift (schema.ts vs roux-ddl.sql)", () => {
  let close: (() => Promise<void>) | undefined;

  before(async () => {
    const created = await createPgliteDb();
    setTestDb(created.db);
    close = () => created.client.close();
  });

  after(async () => {
    setTestDb(null);
    await close?.();
  });

  for (const { name, table, allowExtra = [] } of TABLES) {
    it(`roux.${name} has every Drizzle column`, async () => {
      const { getDb } = await import("@/lib/db");
      const db = getDb();
      const result = await db.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'roux' AND table_name = ${name}
      `);
      const raw: unknown[] = Array.isArray(result)
        ? result
        : ((result as unknown as { rows: unknown[] }).rows ?? []);
      const dbCols = new Set(
        raw.map((r) => {
          const o = r as Record<string, unknown>;
          return String(o.column_name ?? o.columnName ?? Object.values(o)[0]);
        }),
      );

      const expected = drizzleColumnNames(table);
      const missing = expected.filter((c) => !dbCols.has(c));
      assert.deepEqual(
        missing,
        [],
        `roux.${name} missing columns (schema.ts vs DDL): ${missing.join(", ")}. DB has: ${[...dbCols].sort().join(", ")}`,
      );

      // Optional: surface unexpected columns other than known generated extras
      const unexpected = [...dbCols].filter(
        (c) => !expected.includes(c) && !allowExtra.includes(c),
      );
      assert.deepEqual(
        unexpected,
        [],
        `roux.${name} has DDL-only columns not in schema.ts: ${unexpected.join(", ")}`,
      );
    });
  }
});
