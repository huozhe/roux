/**
 * ARCH-2 survivor tests: SQL list path (filters, sort, FTS) under pglite.
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { recipes, setTestDb, users } from "@/lib/db";
import { createPgliteDb, type TestDb } from "@/lib/db/test/pglite-harness";
import { listRecipes } from "./queries";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const R3 = "33333333-3333-4333-8333-333333333333";

let close: (() => Promise<void>) | undefined;
let db: TestDb;

async function seed() {
  await db.delete(recipes);
  await db.delete(users);
  await db.insert(users).values({
    id: USER,
    email: "u@example.com",
    googleSub: "sub-u",
  });
  const t0 = new Date("2026-01-01T00:00:00.000Z");
  const t1 = new Date("2026-02-01T00:00:00.000Z");
  const t2 = new Date("2026-03-01T00:00:00.000Z");
  await db.insert(recipes).values([
    {
      id: R1,
      userId: USER,
      videoId: "v1",
      title: "Mapo Tofu",
      videoTitle: "REAL Mapo",
      channelTitle: "Wok Lab",
      cuisine: "Sichuan",
      mainIngredient: "Tofu",
      cookMinutes: 25,
      ingredients: [{ qty: "400g", name: "soft tofu", inferred: false }],
      steps: [{ n: 1, text: "Simmer", t_seconds: 10 }],
      addedAt: t0,
      writtenAt: t0,
      uploadedAt: t0,
    },
    {
      id: R2,
      userId: USER,
      videoId: "v2",
      title: "Ramen Bowl",
      videoTitle: "Tonkotsu Ramen",
      channelTitle: "Noodle House",
      cuisine: "Japanese",
      mainIngredient: "Noodles",
      cookMinutes: 90,
      ingredients: [{ qty: "1", name: "noodles", inferred: false }],
      steps: [{ n: 1, text: "Boil", t_seconds: 20 }],
      addedAt: t1,
      writtenAt: t1,
      uploadedAt: t1,
    },
    {
      id: R3,
      userId: USER,
      videoId: "v3",
      title: "Archived Soup",
      videoTitle: "Old Soup",
      channelTitle: "Past Meals",
      cuisine: "Japanese",
      mainIngredient: "Broth",
      cookMinutes: 40,
      ingredients: [],
      steps: [{ n: 1, text: "Simmer", t_seconds: 5 }],
      addedAt: t2,
      writtenAt: t2,
      uploadedAt: t2,
      archivedAt: t2,
    },
  ]);
}

describe("listRecipes SQL path (ARCH-2)", () => {
  before(async () => {
    const created = await createPgliteDb();
    db = created.db;
    close = () => created.client.close();
    setTestDb(db);
  });

  after(async () => {
    setTestDb(null);
    await close?.();
  });

  beforeEach(async () => {
    await seed();
  });

  it("view=library excludes archived", async () => {
    const list = await listRecipes(USER, { view: "library" });
    assert.equal(list.length, 2);
    assert.ok(list.every((r) => r.id !== R3));
  });

  it("view=archive only archived", async () => {
    const list = await listRecipes(USER, { view: "archive" });
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, R3);
  });

  it("filters cuisine", async () => {
    const list = await listRecipes(USER, {
      view: "library",
      cuisine: ["Japanese"],
    });
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, R2);
  });

  it("filters main ingredient", async () => {
    const list = await listRecipes(USER, {
      view: "library",
      main: ["Tofu"],
    });
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, R1);
  });

  it("q matches title via ILIKE/FTS", async () => {
    const list = await listRecipes(USER, { view: "library", q: "mapo" });
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, R1);
  });

  it("q matches ingredient text (search vector)", async () => {
    const list = await listRecipes(USER, { view: "library", q: "noodles" });
    assert.ok(list.some((r) => r.id === R2));
  });

  it("sort by cook time ascending", async () => {
    const list = await listRecipes(USER, {
      view: "library",
      sort: "time",
      dir: "asc",
    });
    assert.equal(list.length, 2);
    assert.equal(list[0]!.id, R1); // 25 min
    assert.equal(list[1]!.id, R2); // 90 min
  });

  it("sort by added desc (default newest first)", async () => {
    const list = await listRecipes(USER, {
      view: "library",
      sort: "added",
      dir: "desc",
    });
    assert.equal(list[0]!.id, R2);
    assert.equal(list[1]!.id, R1);
  });
});
