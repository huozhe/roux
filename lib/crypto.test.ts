import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { decrypt, encrypt } from "./crypto";

const HEX_KEY = "a".repeat(64);
const B64_KEY = Buffer.alloc(32, 7).toString("base64");

describe("crypto encrypt/decrypt", () => {
  const prev = process.env.TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    if (prev === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = prev;
  });

  it("round-trips with 64-hex key", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = HEX_KEY;
    const plain = "refresh-token-xyz";
    const ct = await encrypt(plain);
    assert.notEqual(ct, plain);
    assert.equal(await decrypt(ct), plain);
  });

  it("round-trips with base64 32-byte key", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = B64_KEY;
    const plain = "another-secret";
    assert.equal(await decrypt(await encrypt(plain)), plain);
  });

  it("produces different ciphertext each encrypt (random IV)", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = HEX_KEY;
    const a = await encrypt("same");
    const b = await encrypt("same");
    assert.notEqual(a, b);
  });

  it("rejects short ciphertext", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = HEX_KEY;
    await assert.rejects(() => decrypt("aaaa"), /Invalid ciphertext/);
  });

  it("throws when key missing", async () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    await assert.rejects(() => encrypt("x"), /TOKEN_ENCRYPTION_KEY/);
  });
});
