/**
 * Whole-library guest access at the query layer (docs/plans/shared-library-mode.md).
 * A guest link is a bearer token: it must show exactly the owner's live shelf,
 * with notes stripped, and nothing at all once revoked.
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  libraryShares,
  recipeTombstones,
  recipes,
  setTestDb,
  shareLinks,
  users,
} from "@/lib/db";
import { createPgliteDb, type TestDb } from "@/lib/db/test/pglite-harness";
import {
  createLibraryShare,
  getSharedLibrary,
  getSharedLibraryRecipe,
  listLibraryShares,
  revokeLibraryShare,
} from "@/lib/recipes/queries";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RECIPE_LIVE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RECIPE_ARCHIVED = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const RECIPE_DELETED = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const RECIPE_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let clientClose: (() => Promise<void>) | undefined;
let db: TestDb;

const now = new Date("2026-01-15T12:00:00.000Z");

async function seed() {
  await db.delete(libraryShares);
  await db.delete(recipeTombstones);
  await db.delete(shareLinks);
  await db.delete(recipes);
  await db.delete(users);

  await db.insert(users).values([
    { id: USER_A, email: "alice@example.com", googleSub: "sub-a", name: "Alice" },
    { id: USER_B, email: "bob@example.com", googleSub: "sub-b", name: null },
  ]);

  await db.insert(recipes).values([
    {
      id: RECIPE_LIVE,
      userId: USER_A,
      videoId: "vid-live",
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
      id: RECIPE_ARCHIVED,
      userId: USER_A,
      videoId: "vid-archived",
      title: "Alice Archived",
      videoTitle: "Archived Video",
      channelTitle: "Alice Channel",
      addedAt: now,
      writtenAt: now,
      archivedAt: now,
    },
    {
      id: RECIPE_DELETED,
      userId: USER_A,
      videoId: "vid-deleted",
      title: "Alice Deleted",
      videoTitle: "Deleted Video",
      channelTitle: "Alice Channel",
      addedAt: now,
      writtenAt: now,
      deletedAt: now,
    },
    {
      id: RECIPE_B,
      userId: USER_B,
      videoId: "vid-b",
      title: "Bob Ramen",
      videoTitle: "Bob Ramen Video",
      channelTitle: "Bob Channel",
      addedAt: now,
      writtenAt: now,
    },
  ]);
}

describe("library guest links (query layer)", () => {
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

  beforeEach(seed);

  it("mints a 128-bit token, distinct every time", async () => {
    const one = await createLibraryShare(USER_A, "Mum");
    const two = await createLibraryShare(USER_A, "Dad");
    assert.match(one.token, /^[0-9a-f]{32}$/);
    assert.match(two.token, /^[0-9a-f]{32}$/);
    assert.notEqual(one.token, two.token);
    assert.equal(one.label, "Mum");
  });

  it("caps the label at 60 chars and trims it", async () => {
    const share = await createLibraryShare(USER_A, `  ${"x".repeat(80)}  `);
    assert.equal(share.label.length, 60);
  });

  it("shows the owner's live shelf with notes stripped", async () => {
    const { token } = await createLibraryShare(USER_A, "Mum");
    const shared = await getSharedLibrary(token);
    assert.ok(shared);
    assert.equal(shared.ownerName, "Alice");
    assert.deepEqual(
      shared.recipes.map((r) => r.id),
      [RECIPE_LIVE],
    );
    assert.equal(shared.recipes[0]!.notes, null);
    assert.equal(shared.recipes[0]!.verified, false);
  });

  it("falls back to the owner's email when they have no name", async () => {
    const { token } = await createLibraryShare(USER_B, "");
    const shared = await getSharedLibrary(token);
    assert.equal(shared?.ownerName, null);
    assert.equal(shared?.ownerEmail, "bob@example.com");
  });

  it("never leaks another user's recipes", async () => {
    const { token } = await createLibraryShare(USER_A, "Mum");
    const shared = await getSharedLibrary(token);
    assert.ok(shared);
    assert.ok(!shared.recipes.some((r) => r.id === RECIPE_B));
    assert.equal(await getSharedLibraryRecipe(token, RECIPE_B), null);
  });

  it("hides archived and deleted recipes, by shelf and by direct link", async () => {
    const { token } = await createLibraryShare(USER_A, "Mum");
    assert.equal(await getSharedLibraryRecipe(token, RECIPE_ARCHIVED), null);
    assert.equal(await getSharedLibraryRecipe(token, RECIPE_DELETED), null);
  });

  it("serves one recipe by token with notes stripped", async () => {
    const { token } = await createLibraryShare(USER_A, "Mum");
    const access = await getSharedLibraryRecipe(token, RECIPE_LIVE);
    assert.ok(access);
    assert.equal(access.recipe.id, RECIPE_LIVE);
    assert.equal(access.recipe.notes, null);
    assert.equal(access.recipe.verified, false);
  });

  it("returns nothing for an unknown token", async () => {
    assert.equal(await getSharedLibrary("f".repeat(32)), null);
    assert.equal(
      await getSharedLibraryRecipe("f".repeat(32), RECIPE_LIVE),
      null,
    );
  });

  it("revoking one guest kills that token and leaves the others", async () => {
    const mum = await createLibraryShare(USER_A, "Mum");
    const dad = await createLibraryShare(USER_A, "Dad");

    assert.equal(await revokeLibraryShare(USER_A, mum.token), "ok");

    assert.equal(await getSharedLibrary(mum.token), null);
    assert.equal(await getSharedLibraryRecipe(mum.token, RECIPE_LIVE), null);
    assert.ok(await getSharedLibrary(dad.token));

    const listed = await listLibraryShares(USER_A);
    assert.deepEqual(
      listed.map((g) => g.token),
      [dad.token],
    );
  });

  it("revoke is idempotent", async () => {
    const { token } = await createLibraryShare(USER_A, "Mum");
    assert.equal(await revokeLibraryShare(USER_A, token), "ok");
    assert.equal(await revokeLibraryShare(USER_A, token), "ok");
  });

  it("a stranger cannot revoke someone else's guest link", async () => {
    const { token } = await createLibraryShare(USER_A, "Mum");
    assert.equal(await revokeLibraryShare(USER_B, token), "forbidden");
    assert.ok(await getSharedLibrary(token));
  });

  it("reports not_found for an unknown token", async () => {
    assert.equal(
      await revokeLibraryShare(USER_A, "0".repeat(32)),
      "not_found",
    );
  });

  it("lists only the caller's own guest links", async () => {
    await createLibraryShare(USER_A, "Mum");
    await createLibraryShare(USER_B, "Carol");
    const mine = await listLibraryShares(USER_A);
    assert.equal(mine.length, 1);
    assert.equal(mine[0]!.label, "Mum");
  });
});
