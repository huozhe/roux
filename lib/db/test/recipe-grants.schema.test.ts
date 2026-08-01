/**
 * §7 step 1 smoke: recipe_grants exists on pglite and enforces one active grant.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { recipeGrants, recipes, setTestDb, users } from "@/lib/db";
import { createPgliteDb, type TestDb } from "@/lib/db/test/pglite-harness";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RECIPE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let close: (() => Promise<void>) | undefined;
let db: TestDb;

describe("recipe_grants schema (pglite)", () => {
  before(async () => {
    const created = await createPgliteDb();
    db = created.db;
    close = () => created.client.close();
    setTestDb(db);

    await db.insert(users).values([
      { id: USER_A, email: "a@ex.com", googleSub: "ga" },
      { id: USER_B, email: "b@ex.com", googleSub: "gb" },
    ]);
    const now = new Date();
    await db.insert(recipes).values({
      id: RECIPE,
      userId: USER_A,
      videoId: "v1",
      title: "Soup",
      videoTitle: "Soup vid",
      channelTitle: "Ch",
      ingredients: [],
      steps: [],
      addedAt: now,
      writtenAt: now,
    });
  });

  after(async () => {
    setTestDb(null);
    await close?.();
  });

  it("inserts an active grant", async () => {
    const [row] = await db
      .insert(recipeGrants)
      .values({
        recipeId: RECIPE,
        ownerUserId: USER_A,
        recipientUserId: USER_B,
      })
      .returning();
    assert.ok(row?.id);
    assert.equal(row!.revokedAt, null);
  });

  it("rejects a second active grant for same recipe+recipient", async () => {
    await assert.rejects(async () => {
      await db.insert(recipeGrants).values({
        recipeId: RECIPE,
        ownerUserId: USER_A,
        recipientUserId: USER_B,
      });
    }, (err: unknown) => {
      const msg = err instanceof Error ? `${err.message} ${String((err as Error).cause ?? "")}` : String(err);
      return /unique|duplicate|recipe_grants_active/i.test(msg);
    });
  });

  it("allows a new active grant after revoke", async () => {
    await db
      .update(recipeGrants)
      .set({ revokedAt: new Date() })
      .where(eq(recipeGrants.recipientUserId, USER_B));

    const [row] = await db
      .insert(recipeGrants)
      .values({
        recipeId: RECIPE,
        ownerUserId: USER_A,
        recipientUserId: USER_B,
      })
      .returning();
    assert.ok(row?.id);
    assert.equal(row!.revokedAt, null);

    const active = await db
      .select({ id: recipeGrants.id })
      .from(recipeGrants)
      .where(
        sql`${recipeGrants.recipeId} = ${RECIPE}
          AND ${recipeGrants.recipientUserId} = ${USER_B}
          AND ${recipeGrants.revokedAt} IS NULL`,
      );
    assert.equal(active.length, 1);
  });
});
