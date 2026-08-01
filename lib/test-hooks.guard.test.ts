import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTestDb } from "@/lib/db";
import { setTestUserId } from "@/lib/recipes/auth";

describe("test hooks refuse production", () => {
  it("setTestUserId throws when NODE_ENV=production", () => {
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      assert.throws(
        () => setTestUserId("x"),
        /not available in production/,
      );
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("setTestDb throws when NODE_ENV=production", () => {
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      assert.throws(() => setTestDb({}), /not available in production/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
