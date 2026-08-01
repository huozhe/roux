import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SYSTEM_PROMPT } from "./prompt";

/**
 * Prompt caching on Sonnet 4.6 requires ≥1024 tokens on the cached prefix.
 * Measured 2026-07-31: 3870 chars ≈ 1063 tokens (3.64 chars/token).
 * Fail if the prompt is trimmed below a conservative floor so caching
 * does not silently no-op (cache_creation_input_tokens stays 0).
 */
/** 1024 tok × 3.64 chars/token = 3728 min; 3800 keeps ~2% margin. Verified via countTokens. */
const MIN_CHARS_FOR_CACHE = 3800;

describe("SYSTEM_PROMPT cache eligibility", () => {
  it("stays long enough for Anthropic prompt cache minimum", () => {
    assert.ok(
      SYSTEM_PROMPT.length >= MIN_CHARS_FOR_CACHE,
      `SYSTEM_PROMPT is ${SYSTEM_PROMPT.length} chars; need ≥${MIN_CHARS_FOR_CACHE} so Sonnet cache (≥1024 tok) keeps working`,
    );
  });
});
