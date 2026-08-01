/**
 * Route-layer authz for inter-user grants (PR #11 review).
 * Handlers are plain functions; requireUserId/setTestDb inject the session + DB.
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  recipeGrants,
  recipeTombstones,
  recipes,
  setTestDb,
  shareLinks,
  users,
} from "@/lib/db";
import { createPgliteDb, type TestDb } from "@/lib/db/test/pglite-harness";
import { setTestUserId } from "@/lib/recipes/auth";
import { createRecipeGrant } from "@/lib/recipes/queries";
import { resetRateLimitBuckets } from "@/lib/rate-limit";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RECIPE_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

let clientClose: (() => Promise<void>) | undefined;
let db: TestDb;

async function seed() {
  resetRateLimitBuckets();
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

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("grant routes (HTTP handlers)", () => {
  before(async () => {
    const created = await createPgliteDb();
    db = created.db;
    clientClose = () => created.client.close();
    setTestDb(db);
  });

  after(async () => {
    setTestUserId(undefined);
    setTestDb(null);
    await clientClose?.();
  });

  beforeEach(async () => {
    setTestUserId(undefined);
    await seed();
  });

  it("GET /api/recipes/:id returns role grantee with notes stripped", async () => {
    await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    const { GET } = await import("@/app/api/recipes/[id]/route");
    setTestUserId(USER_B);
    const res = await GET(new Request("http://test/api/recipes/" + RECIPE_A), {
      params: Promise.resolve({ id: RECIPE_A }),
    });
    assert.equal(res.status, 200);
    const body = await json(res);
    assert.equal(body.role, "grantee");
    const recipe = body.recipe as { notes: unknown; verified: boolean; title: string };
    assert.equal(recipe.notes, null);
    assert.equal(recipe.verified, false);
    assert.equal(recipe.title, "Alice Mapo");
  });

  it("PATCH /api/recipes/:id rejects grantee (write path still owner-only)", async () => {
    await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    const { PATCH } = await import("@/app/api/recipes/[id]/route");
    setTestUserId(USER_B);
    const res = await PATCH(
      new Request("http://test/api/recipes/" + RECIPE_A, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Hacked" }),
      }),
      { params: Promise.resolve({ id: RECIPE_A }) },
    );
    assert.equal(res.status, 404);
  });

  it("DELETE /api/recipes/:id rejects grantee", async () => {
    await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    const { DELETE } = await import("@/app/api/recipes/[id]/route");
    setTestUserId(USER_B);
    const res = await DELETE(new Request("http://test/api/recipes/" + RECIPE_A), {
      params: Promise.resolve({ id: RECIPE_A }),
    });
    assert.equal(res.status, 404);
  });

  it("POST grants: unknown email → 404 (no oracle over HTTP)", async () => {
    const { POST } = await import("@/app/api/recipes/[id]/grants/route");
    setTestUserId(USER_A);
    const res = await POST(
      new Request("http://test/api/recipes/" + RECIPE_A + "/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com" }),
      }),
      { params: Promise.resolve({ id: RECIPE_A }) },
    );
    assert.equal(res.status, 404);
    const body = await json(res);
    assert.equal(body.error, "Not found");
  });

  it("POST grants: self-grant → 404", async () => {
    const { POST } = await import("@/app/api/recipes/[id]/grants/route");
    setTestUserId(USER_A);
    const res = await POST(
      new Request("http://test/api/recipes/" + RECIPE_A + "/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com" }),
      }),
      { params: Promise.resolve({ id: RECIPE_A }) },
    );
    assert.equal(res.status, 404);
  });

  it("DELETE grant with mismatched recipe :id → 404", async () => {
    const g = await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    const { DELETE } = await import(
      "@/app/api/recipes/[id]/grants/[grantId]/route"
    );
    setTestUserId(USER_A);
    const wrongRecipeId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const res = await DELETE(
      new Request(
        `http://test/api/recipes/${wrongRecipeId}/grants/${g!.grantId}`,
      ),
      {
        params: Promise.resolve({
          id: wrongRecipeId,
          grantId: g!.grantId,
        }),
      },
    );
    assert.equal(res.status, 404);
  });

  it("DELETE grant by non-owner → 403", async () => {
    const g = await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    const { DELETE } = await import(
      "@/app/api/recipes/[id]/grants/[grantId]/route"
    );
    setTestUserId(USER_B);
    const res = await DELETE(
      new Request(`http://test/api/recipes/${RECIPE_A}/grants/${g!.grantId}`),
      {
        params: Promise.resolve({ id: RECIPE_A, grantId: g!.grantId }),
      },
    );
    assert.equal(res.status, 403);
  });

  it("GET /api/recipes/shared lists grants for the session user", async () => {
    await createRecipeGrant(USER_A, RECIPE_A, "bob@example.com");
    const { GET } = await import("@/app/api/recipes/shared/route");
    setTestUserId(USER_B);
    const res = await GET();
    assert.equal(res.status, 200);
    const body = await json(res);
    const list = body.recipes as { recipeId: string }[];
    assert.equal(list.length, 1);
    assert.equal(list[0]!.recipeId, RECIPE_A);
  });

  it("POST grants rate limit fires", async () => {
    const { POST } = await import("@/app/api/recipes/[id]/grants/route");
    setTestUserId(USER_A);
    const { RATE_LIMITS } = await import("@/lib/rate-limit");
    const limit = RATE_LIMITS.recipeGrants.perUser.limit;
    let last: Response | null = null;
    for (let i = 0; i < limit + 1; i++) {
      last = await POST(
        new Request("http://test/api/recipes/" + RECIPE_A + "/grants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "bob@example.com" }),
        }),
        { params: Promise.resolve({ id: RECIPE_A }) },
      );
    }
    assert.ok(last);
    assert.equal(last!.status, 429);
    const body = await json(last!);
    assert.equal(body.code, "RATE_LIMITED");
  });
});
