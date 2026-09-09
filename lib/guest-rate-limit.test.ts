import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientIp } from "./guest-rate-limit";

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    assert.equal(clientIp("1.2.3.4, 10.0.0.1, 10.0.0.2", null), "1.2.3.4");
  });

  it("trims whitespace", () => {
    assert.equal(clientIp("  1.2.3.4 ", null), "1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    assert.equal(clientIp(null, "5.6.7.8"), "5.6.7.8");
    assert.equal(clientIp("", "5.6.7.8"), "5.6.7.8");
  });

  it("falls back to a shared bucket when both are absent", () => {
    assert.equal(clientIp(null, null), "unknown");
  });
});
