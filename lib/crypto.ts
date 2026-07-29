/**
 * AES-GCM encrypt/decrypt for OAuth refresh tokens.
 * TOKEN_ENCRYPTION_KEY: 32-byte key as 64 hex chars (or base64).
 */

const IV_LEN = 12;

function keyBytes(): ArrayBuffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set");

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    }
    return out.buffer;
  }

  const bin = Buffer.from(raw, "base64");
  if (bin.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex or base64)");
  }
  return bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    keyBytes(),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt plaintext → base64url(iv || ciphertext). */
export async function encrypt(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await importKey();
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return Buffer.from(out).toString("base64url");
}

/** Decrypt base64url(iv || ciphertext) → plaintext. */
export async function decrypt(payload: string): Promise<string> {
  const buf = Buffer.from(payload, "base64url");
  if (buf.length <= IV_LEN) throw new Error("Invalid ciphertext");
  const iv = buf.subarray(0, IV_LEN);
  const ct = buf.subarray(IV_LEN);
  const key = await importKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
