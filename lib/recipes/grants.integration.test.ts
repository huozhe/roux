/**
 * Inter-user grants query layer (design §4 / §7.2).
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import {
  recipeGrants,
  recipeTombstones,
  recipes,
  setTestDb,
  shareLinks,
  users,
} from "@/lib/db";
import { createPgliteDb, type TestDb } from "@/lib/db/test/pglite-harness";
import {
  archiveRecipe,
  createRecipeGrant,
  getRecipe,
  getRecipeForViewer,
  getSharedRecipeBySlug,
  listGrantedToMe,
  listOutgoingGrants,
  listRecipes,
  patchRecipe,
  restoreRecipe,
  revokeRecipeGrant,
  shareRecipe,
} from "./queries";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RECIPE_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

let clientClose: (() => Promise<void>) | undefined;
let db: TestDb;

async function seed() {
  await db.delete(recipeTombstones);
  await db.delete(recipeGrants);
  await db.delete(shareLinks);
  await db.delete(recipes);
  await db.delete(users);

  await db.insert(users).values([
    {
      id: USER_A,
      email: "alice@example.com",
      googleSub: "sub-a",
      name: "Alice",
    },
    {
      id: USER_B,
      email: "bob@example.com",
      googleSub: "sub-b",
      name: "Bob",
    },
    {
      id: USER_C,
      email: "carol@example.com",
      googleSub: "sub-c",
      name: "Carol",
    },
  ]);

  const now = new Date("2026-01-15T12:00:00.000Z");
  await db.insert(recipes).values({
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
  });
}

describe("recipe grants query layer", () => {
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

  it("A grants B → B getRecipeForViewer stripped; A full notes via getRecipe", async () => {
    const g = await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    assert.ok(g?.grantId);

    const asB = await getRecipeForViewer(USER_B, RECIPE_A);
    assert.ok(asB);
    assert.equal(asB!.role, "grantee");
    assert.equal(asB!.recipe.notes, null);
    assert.equal(asB!.recipe.verified, false);
    assert.equal(asB!.recipe.title, "Alice Mapo");

    const asA = await getRecipe(USER_A, RECIPE_A);
    assert.equal(asA?.notes, "alice private notes");
    assert.equal(asA?.verified, true);

    const ownerView = await getRecipeForViewer(USER_A, RECIPE_A);
    assert.equal(ownerView?.role, "owner");
    assert.equal(ownerView?.recipe.notes, "alice private notes");
  });

  it("B cannot write A's recipe", async () => {
    await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    assert.equal(await patchRecipe(USER_B, RECIPE_A, { title: "Hacked" }), null);
    assert.equal((await getRecipe(USER_A, RECIPE_A))?.title, "Alice Mapo");
  });

  it("A revokes → B loses access", async () => {
    const g = await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    assert.equal(await revokeRecipeGrant(USER_A, g!.grantId), "ok");
    assert.equal(await getRecipeForViewer(USER_B, RECIPE_A), null);
  });

  it("archive hides from grantee; unarchive restores (grant not revoked)", async () => {
    const g = await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    assert.ok(await getRecipeForViewer(USER_B, RECIPE_A));

    await archiveRecipe(USER_A, RECIPE_A);
    assert.equal(await getRecipeForViewer(USER_B, RECIPE_A), null);
    assert.equal((await listGrantedToMe(USER_B)).length, 0);

    // Grant row still active
    const rows = await db
      .select()
      .from(recipeGrants)
      .where(eq(recipeGrants.id, g!.grantId));
    assert.equal(rows[0]!.revokedAt, null);

    await restoreRecipe(USER_A, RECIPE_A);
    assert.ok(await getRecipeForViewer(USER_B, RECIPE_A));
    assert.equal((await listGrantedToMe(USER_B)).length, 1);
  });

  it("public slug still reads archived recipe (asymmetry)", async () => {
    const shared = await shareRecipe(USER_A, RECIPE_A);
    assert.ok(shared?.slug);
    await archiveRecipe(USER_A, RECIPE_A);
    const pub = await getSharedRecipeBySlug(shared!.slug);
    assert.ok(pub);
    assert.equal(pub!.title, "Alice Mapo");
    assert.equal(pub!.notes, null);
  });

  it("C cannot use B's grant; revokeShare-style forbidden for wrong owner", async () => {
    const g = await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    assert.equal(await getRecipeForViewer(USER_C, RECIPE_A), null);
    assert.equal(await revokeRecipeGrant(USER_B, g!.grantId), "forbidden");
    assert.equal(await revokeRecipeGrant(USER_C, g!.grantId), "forbidden");
  });

  it("listGrantedToMe only B's grants; listRecipes stays owner-only", async () => {
    await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    const mine = await listGrantedToMe(USER_B);
    assert.equal(mine.length, 1);
    assert.equal(mine[0]!.recipeId, RECIPE_A);
    assert.equal(mine[0]!.ownerEmail, "alice@example.com");

    assert.equal((await listGrantedToMe(USER_C)).length, 0);
    assert.equal((await listRecipes(USER_B)).length, 0);
    assert.equal((await listRecipes(USER_A)).length, 1);
  });

  it("unknown email and self-grant return null (no oracle)", async () => {
    assert.equal(
      await createRecipeGrant(USER_A, RECIPE_A, "nobody@example.com"),
      null,
    );
    assert.equal(
      await createRecipeGrant(USER_A, RECIPE_A, "alice@example.com"),
      null,
    );
    assert.equal(await createRecipeGrant(USER_B, RECIPE_A, "bob@example.com"), null);
  });

  it("create is idempotent for active grant", async () => {
    const g1 = await createRecipeGrant(USER_A, RECIPE_A, "Bob@example.com");
    const g2 = await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    assert.ok(g1 && g2);
    assert.equal(g1!.grantId, g2!.grantId);
  });

  it("listOutgoingGrants for owner", async () => {
    await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    const out = await listOutgoingGrants(USER_A, RECIPE_A);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.recipientEmail, "bob@example.com");
  });
});
