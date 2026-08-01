import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getPublishedPrefs,
  publishPrefs,
  resetPublishedPrefs,
} from "./client";
import { DEFAULT_PREFS } from "@/lib/types";

describe("publishPrefs store (UX-2)", () => {
  afterEach(() => {
    resetPublishedPrefs();
  });

  it("starts empty so server initial is used", () => {
    assert.equal(getPublishedPrefs(), null);
  });

  it("stores prefs after publish", () => {
    publishPrefs({ ...DEFAULT_PREFS, layout: "split", newShelf: true });
    const p = getPublishedPrefs();
    assert.ok(p);
    assert.equal(p!.layout, "split");
    assert.equal(p!.newShelf, true);
  });

  it("reset clears the session override", () => {
    publishPrefs({ ...DEFAULT_PREFS, layout: "split" });
    resetPublishedPrefs();
    assert.equal(getPublishedPrefs(), null);
  });
});
