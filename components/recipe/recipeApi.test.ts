import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { recipeApiJson } from "./recipeApi";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("recipeApiJson", () => {
  it("returns data on 200 JSON", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(JSON.stringify({ recipe: { id: "r1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const result = await recipeApiJson<{ recipe: { id: string } }>(
      "/api/recipes/r1",
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.recipe.id, "r1");
  });

  it("returns ok with undefined data on 204", async () => {
    globalThis.fetch = mock.fn(
      async () => new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;

    const result = await recipeApiJson<undefined>("/api/recipes/r1", {
      method: "DELETE",
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data, undefined);
  });

  it("surfaces body.error on non-ok", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const result = await recipeApiJson("/api/recipes/missing");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "Not found");
  });

  it("falls back when body has no error field", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response("{}", {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const result = await recipeApiJson("/api/boom");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /500/);
  });

  it("catches network failures", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const result = await recipeApiJson("/api/x");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "offline");
  });
});
