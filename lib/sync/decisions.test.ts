import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canWriteExtract,
  shouldEarlyStopPage,
  shouldSkipReextract,
  shouldSkipVideo,
} from "./decisions";

describe("shouldSkipVideo", () => {
  it("skips tombstoned", () => {
    assert.equal(
      shouldSkipVideo({ tombstoned: true, archived: false }),
      true,
    );
  });
  it("skips archived", () => {
    assert.equal(
      shouldSkipVideo({ tombstoned: false, archived: true }),
      true,
    );
  });
  it("allows fresh video", () => {
    assert.equal(
      shouldSkipVideo({ tombstoned: false, archived: false }),
      false,
    );
  });
});

describe("shouldSkipReextract", () => {
  it("skips verified recipes", () => {
    assert.equal(shouldSkipReextract({ verified: true }), true);
  });
  it("allows unverified", () => {
    assert.equal(shouldSkipReextract({ verified: false }), false);
  });
  it("allows missing row", () => {
    assert.equal(shouldSkipReextract(null), false);
  });
});

describe("shouldEarlyStopPage", () => {
  const known = new Set(["a", "b", "c"]);

  it("never stops on first crawl", () => {
    assert.equal(shouldEarlyStopPage(["a", "b"], known, true), false);
    assert.equal(shouldEarlyStopPage(["a", "b"], known, true), false);
  });

  it("stops when entire page is known", () => {
    assert.equal(shouldEarlyStopPage(["a", "b"], known, false), true);
  });

  it("continues when any id is new", () => {
    assert.equal(shouldEarlyStopPage(["a", "z"], known, false), false);
  });

  it("stops on empty page", () => {
    assert.equal(shouldEarlyStopPage([], known, false), true);
  });
});

describe("canWriteExtract", () => {
  it("inserts when no row", () => {
    assert.equal(canWriteExtract(null), "insert");
  });
  it("skips verified", () => {
    assert.equal(
      canWriteExtract({ verified: true, archivedAt: null }),
      "skip",
    );
  });
  it("skips archived", () => {
    assert.equal(
      canWriteExtract({
        verified: false,
        archivedAt: new Date("2026-01-01"),
      }),
      "skip",
    );
  });
  it("updates unverified active", () => {
    assert.equal(
      canWriteExtract({ verified: false, archivedAt: null }),
      "update",
    );
  });
});
