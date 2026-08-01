import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  resetRateLimitBuckets,
  takeRateLimit,
  takeRateLimitMulti,
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

describe("takeRateLimitMulti", () => {
  afterEach(() => {
    resetRateLimitBuckets();
  });

  it("blocks when global is exhausted without burning per-user", () => {
    const t0 = 4_000_000;
    const global = { key: "g", limit: 1, windowMs: 60_000 };
    const userA = { key: "u:a", limit: 5, windowMs: 60_000 };
    const userB = { key: "u:b", limit: 5, windowMs: 60_000 };

    assert.equal(takeRateLimitMulti([global, userA], t0).ok, true);
    // Global gone — user B must not get a take, and u:b should still be free later
    assert.equal(takeRateLimitMulti([global, userB], t0 + 1).ok, false);
    // After window, both work
    assert.equal(takeRateLimitMulti([global, userB], t0 + 60_000).ok, true);
  });

  it("blocks when per-user is exhausted even if global remains", () => {
    const t0 = 5_000_000;
    const global = { key: "g2", limit: 10, windowMs: 60_000 };
    const user = { key: "u:x", limit: 1, windowMs: 60_000 };
    assert.equal(takeRateLimitMulti([global, user], t0).ok, true);
    assert.equal(takeRateLimitMulti([global, user], t0 + 1).ok, false);
  });
});
