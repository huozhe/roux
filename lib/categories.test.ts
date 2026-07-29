import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  categoryOptions,
  CUISINES,
  mergeLearnedCategories,
} from "./categories";

describe("mergeLearnedCategories", () => {
  it("adds novel cuisine and main", () => {
    const next = mergeLearnedCategories(
      {},
      { cuisine: "Middle Eastern", main: "Lamb" },
    );
    assert.deepEqual(next, {
      customCuisines: ["Middle Eastern"],
      customMains: ["Lamb"],
    });
  });

  it("skips base list items", () => {
    const next = mergeLearnedCategories(
      {},
      { cuisine: "Sichuan", main: "Beef" },
    );
    assert.equal(next, null);
  });

  it("skips case-insensitive duplicates", () => {
    const next = mergeLearnedCategories(
      { customCuisines: ["middle eastern"], customMains: ["lamb"] },
      { cuisine: "Middle Eastern", main: "LAMB" },
    );
    assert.equal(next, null);
  });

  it("preserves existing customs when adding one", () => {
    const next = mergeLearnedCategories(
      { customCuisines: ["African"], customMains: [] },
      { cuisine: "Middle Eastern", main: null },
    );
    assert.deepEqual(next?.customCuisines, ["African", "Middle Eastern"]);
    assert.deepEqual(next?.customMains, []);
  });
});

describe("categoryOptions", () => {
  it("appends customs after base", () => {
    const opts = categoryOptions(CUISINES, ["Middle Eastern", "sichuan"]);
    assert.ok(opts.includes("Middle Eastern"));
    assert.equal(opts.filter((x) => x.toLowerCase() === "sichuan").length, 1);
  });

  it("omits hidden labels", () => {
    const opts = categoryOptions(
      CUISINES,
      ["Middle Eastern"],
      ["Sichuan", "middle eastern"],
    );
    assert.ok(!opts.some((x) => x.toLowerCase() === "sichuan"));
    assert.ok(!opts.some((x) => x.toLowerCase() === "middle eastern"));
  });
});
