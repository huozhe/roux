/**
 * Route-layer authz for whole-library guest links.
 * Handlers are plain functions; requireUserId/setTestDb inject the session + DB.
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
import { RATE_LIMITS, resetRateLimitBuckets } from "@/lib/rate-limit";
import { setTestUserId } from "@/lib/recipes/auth";
import {
  createLibraryShare,
  getSharedLibrary,
} from "@/lib/recipes/queries";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let clientClose: (() => Promise<void>) | undefined;
let db: TestDb;

async function seed() {
  resetRateLimitBuckets();
  await db.delete(libraryShares);
  await db.delete(recipeTombstones);
  await db.delete(shareLinks);
  await db.delete(recipes);
  await db.delete(users);

  await db.insert(users).values([
    { id: USER_A, email: "alice@example.com", googleSub: "sub-a", name: "Alice" },
    { id: USER_B, email: "bob@example.com", googleSub: "sub-b", name: "Bob" },
  ]);
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function postRequest(label: unknown): Request {
  return new Request("http://test/api/library-shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
}

describe("library guest link routes (HTTP handlers)", () => {
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

  it("POST without a session → 401", async () => {
    const { POST } = await import("@/app/api/library-shares/route");
    setTestUserId(null);
    const res = await POST(postRequest("Mum"));
    assert.equal(res.status, 401);
  });

  it("GET without a session → 401", async () => {
    const { GET } = await import("@/app/api/library-shares/route");
    setTestUserId(null);
    const res = await GET();
    assert.equal(res.status, 401);
  });

  it("DELETE without a session → 401", async () => {
    const { DELETE } = await import("@/app/api/library-shares/[token]/route");
    setTestUserId(null);
    const res = await DELETE(new Request("http://test/api/library-shares/x"), {
      params: Promise.resolve({ token: "x" }),
    });
    assert.equal(res.status, 401);
  });

  it("POST mints a usable token; GET lists it", async () => {
    const { GET, POST } = await import("@/app/api/library-shares/route");
    setTestUserId(USER_A);

    const res = await POST(postRequest("Mum"));
    assert.equal(res.status, 200);
    const created = await json(res);
    assert.match(created.token as string, /^[0-9a-f]{32}$/);
    assert.equal(created.label, "Mum");

    const listRes = await GET();
    const body = await json(listRes);
    const shares = body.shares as Array<{ token: string; label: string }>;
    assert.equal(shares.length, 1);
    assert.equal(shares[0]!.token, created.token);
  });

  it("POST tolerates a missing body and a non-string label", async () => {
    const { POST } = await import("@/app/api/library-shares/route");
    setTestUserId(USER_A);

    const noBody = await POST(
      new Request("http://test/api/library-shares", { method: "POST" }),
    );
    assert.equal(noBody.status, 200);
    assert.equal((await json(noBody)).label, "");

    const badLabel = await POST(postRequest(42));
    assert.equal(badLabel.status, 200);
    assert.equal((await json(badLabel)).label, "");
  });

  it("GET lists only the caller's links", async () => {
    await createLibraryShare(USER_B, "Bob's guest");
    const { GET } = await import("@/app/api/library-shares/route");
    setTestUserId(USER_A);
    const body = await json(await GET());
    assert.deepEqual(body.shares, []);
  });

  it("DELETE by the owner revokes the link", async () => {
    const share = await createLibraryShare(USER_A, "Mum");
    const { DELETE } = await import("@/app/api/library-shares/[token]/route");
    setTestUserId(USER_A);
    const res = await DELETE(
      new Request(`http://test/api/library-shares/${share.token}`),
      { params: Promise.resolve({ token: share.token }) },
    );
    assert.equal(res.status, 204);
    assert.equal(await getSharedLibrary(share.token), null);
  });

  it("DELETE by another user → 403, link keeps working", async () => {
    const share = await createLibraryShare(USER_A, "Mum");
    const { DELETE } = await import("@/app/api/library-shares/[token]/route");
    setTestUserId(USER_B);
    const res = await DELETE(
      new Request(`http://test/api/library-shares/${share.token}`),
      { params: Promise.resolve({ token: share.token }) },
    );
    assert.equal(res.status, 403);
    assert.ok(await getSharedLibrary(share.token));
  });

  it("DELETE of an unknown token → 404", async () => {
    const { DELETE } = await import("@/app/api/library-shares/[token]/route");
    setTestUserId(USER_A);
    const token = "0".repeat(32);
    const res = await DELETE(
      new Request(`http://test/api/library-shares/${token}`),
      { params: Promise.resolve({ token }) },
    );
    assert.equal(res.status, 404);
  });

  it("POST is rate limited per user", async () => {
    const { POST } = await import("@/app/api/library-shares/route");
    setTestUserId(USER_A);
    const { limit } = RATE_LIMITS.libraryShares.perUser;

    for (let i = 0; i < limit; i++) {
      assert.equal((await POST(postRequest(`guest ${i}`))).status, 200);
    }
    const blocked = await POST(postRequest("one too many"));
    assert.equal(blocked.status, 429);

    // The cap is per user — B is unaffected.
    setTestUserId(USER_B);
    assert.equal((await POST(postRequest("Bob's guest"))).status, 200);
  });
});
