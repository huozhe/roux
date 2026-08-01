import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  resetRateLimitBuckets,
  takeRateLimit,
} from "./rate-limit";

describe("takeRateLimit", () => {
  afterEach(() => {
    resetRateLimitBuckets();
  });

  it("allows up to limit within a window", () => {
    const t0 = 1_000_000;
    assert.equal(takeRateLimit("k", 2, 60_000, t0).ok, true);
    assert.equal(takeRateLimit("k", 2, 60_000, t0 + 1).ok, true);
    const blocked = takeRateLimit("k", 2, 60_000, t0 + 2);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.ok(blocked.retryAfterSec >= 1);
    }
  });

  it("resets after the window", () => {
    const t0 = 2_000_000;
    assert.equal(takeRateLimit("k2", 1, 10_000, t0).ok, true);
    assert.equal(takeRateLimit("k2", 1, 10_000, t0 + 1).ok, false);
    assert.equal(takeRateLimit("k2", 1, 10_000, t0 + 10_000).ok, true);
  });

  it("isolates keys", () => {
    const t0 = 3_000_000;
    assert.equal(takeRateLimit("a", 1, 60_000, t0).ok, true);
    assert.equal(takeRateLimit("b", 1, 60_000, t0).ok, true);
    assert.equal(takeRateLimit("a", 1, 60_000, t0 + 1).ok, false);
  });
});
