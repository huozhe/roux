/**
 * Cross-user authorization against real SQL (pglite).
 * Covers TEST-1 item 1 from the external review (#3).
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { recipeTombstones, recipes, setTestDb, users } from "@/lib/db";
import { createPgliteDb, type TestDb } from "@/lib/db/test/pglite-harness";
import {
  archiveRecipe,
  deleteRecipe,
  getRecipe,
  getSharedRecipeBySlug,
  getUserPrefs,
  listRecipes,
  patchRecipe,
  restoreRecipe,
  revokeShare,
  shareRecipe,
  updateUserPrefs,
  verifyRecipe,
} from "./queries";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RECIPE_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RECIPE_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

let clientClose: (() => Promise<void>) | undefined;
let db: TestDb;

async function seed() {
  await db.delete(recipeTombstones);
  await db.delete(recipes);
  // share_links cascade with recipes
  await db.delete(users);

  await db.insert(users).values([
    {
      id: USER_A,
      email: "a@example.com",
      googleSub: "sub-a",
      name: "Alice",
    },
    {
      id: USER_B,
      email: "b@example.com",
      googleSub: "sub-b",
      name: "Bob",
      prefs: {
        layout: "split",
        timestamps: true,
        newShelf: true,
        syncMarkVerified: false,
        customCuisines: ["BobOnlyCuisine"],
      },
    },
  ]);

  const now = new Date("2026-01-15T12:00:00.000Z");
  await db.insert(recipes).values([
    {
      id: RECIPE_A,
      userId: USER_A,
      videoId: "vid-a",
      title: "Alice Mapo",
      videoTitle: "Alice Mapo Video",
      channelTitle: "Alice Channel",
      ingredients: [{ qty: "1", name: "tofu", inferred: false }],
      steps: [{ n: 1, text: "Cook", t_seconds: 10 }],
      notes: "alice private notes",
      verified: true,
      addedAt: now,
      writtenAt: now,
    },
    {
      id: RECIPE_B,
      userId: USER_B,
      videoId: "vid-b",
      title: "Bob Ramen",
      videoTitle: "Bob Ramen Video",
      channelTitle: "Bob Channel",
      ingredients: [{ qty: "2", name: "noodles", inferred: false }],
      steps: [{ n: 1, text: "Boil", t_seconds: 20 }],
      notes: "bob secret notes",
      verified: true,
      cuisine: "Japanese",
      mainIngredient: "Noodles",
      addedAt: now,
      writtenAt: now,
    },
  ]);
}

describe("pglite authz (TEST-1)", () => {
  before(async () => {
    const created = await createPgliteDb();
    db = created.db;
    clientClose = () => created.client.close();
    setTestDb(db);
  });

  after(async () => {
    setTestDb(null);
    await clientClose?.();
  });

  beforeEach(async () => {
    await seed();
  });

  it("spike: generated search tsvector is populated and queryable", async () => {
    const rows = await db.execute<{ has_search: boolean }>(sql`
      SELECT search IS NOT NULL AS has_search
      FROM roux.recipes
      WHERE id = ${RECIPE_B}
    `);
    const row = Array.isArray(rows)
      ? rows[0]
      : (rows as { rows?: { has_search: boolean }[] }).rows?.[0];
    assert.equal(Boolean(row?.has_search), true);

    const found = await listRecipes(USER_B, { q: "ramen" });
    assert.equal(found.length, 1);
    assert.equal(found[0]!.id, RECIPE_B);
    // FTS/ILIKE path — ingredient text is in search vector + listRecipes q
    const fts = await listRecipes(USER_B, { q: "noodles" });
    assert.ok(fts.some((r) => r.id === RECIPE_B));
  });

  it("GET recipe: A cannot read B's recipe", async () => {
    assert.equal(await getRecipe(USER_A, RECIPE_B), null);
    assert.equal((await getRecipe(USER_B, RECIPE_B))?.title, "Bob Ramen");
  });

  it("list recipes: A only sees own rows", async () => {
    const list = await listRecipes(USER_A, { view: "library" });
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, RECIPE_A);
  });

  it("PATCH: A cannot mutate B; B row unchanged", async () => {
    const patched = await patchRecipe(USER_A, RECIPE_B, { title: "Hacked" });
    assert.equal(patched, null);
    const still = await getRecipe(USER_B, RECIPE_B);
    assert.equal(still?.title, "Bob Ramen");
  });

  it("DELETE: A cannot delete B; no tombstone for B's video", async () => {
    assert.equal(await deleteRecipe(USER_A, RECIPE_B), false);
    assert.ok(await getRecipe(USER_B, RECIPE_B));
    const tombs = await db
      .select()
      .from(recipeTombstones)
      .where(eq(recipeTombstones.userId, USER_B));
    assert.equal(tombs.length, 0);
  });

  it("archive / restore / verify: A gets null on B's id", async () => {
    assert.equal(await archiveRecipe(USER_A, RECIPE_B), null);
    assert.equal(await restoreRecipe(USER_A, RECIPE_B), null);
    assert.equal(await verifyRecipe(USER_A, RECIPE_B), null);
    const b = await getRecipe(USER_B, RECIPE_B);
    assert.equal(b?.archived_at, null);
    assert.equal(b?.verified, true);
  });

  it("share: A cannot create share for B's recipe", async () => {
    assert.equal(await shareRecipe(USER_A, RECIPE_B), null);
  });

  it("revokeShare: A gets forbidden on B's slug (not not_found)", async () => {
    const shared = await shareRecipe(USER_B, RECIPE_B);
    assert.ok(shared?.slug);
    assert.equal(await revokeShare(USER_A, shared!.slug), "forbidden");
    // Still active for public resolve
    const pub = await getSharedRecipeBySlug(shared!.slug);
    assert.ok(pub);
    assert.equal(pub!.notes, null);
    assert.equal(pub!.verified, false);
    assert.equal(pub!.title, "Bob Ramen");
  });

  it("prefs: A and B are isolated", async () => {
    const a0 = await getUserPrefs(USER_A);
    assert.ok(!a0.customCuisines?.includes("BobOnlyCuisine"));
    await updateUserPrefs(USER_A, { customCuisines: ["AliceTag"] });
    const a1 = await getUserPrefs(USER_A);
    const b1 = await getUserPrefs(USER_B);
    assert.deepEqual(a1.customCuisines, ["AliceTag"]);
    assert.deepEqual(b1.customCuisines, ["BobOnlyCuisine"]);
  });

  it("owner delete writes tombstone only for that user", async () => {
    assert.equal(await deleteRecipe(USER_B, RECIPE_B), true);
    assert.equal(await getRecipe(USER_B, RECIPE_B), null);
    const tombs = await db
      .select()
      .from(recipeTombstones)
      .where(eq(recipeTombstones.userId, USER_B));
    assert.equal(tombs.length, 1);
    assert.equal(tombs[0]!.videoId, "vid-b");
  });
});
