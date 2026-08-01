/**
 * Fixed-window rate limiter (in-process).
 *
 * Good enough to stop a single signed-in user from burning shared third-party
 * quota (Anthropic / YouTube) via rapid API calls. Not a distributed limiter —
 * each serverless isolate has its own map — so limits are soft under high
 * concurrency. Prefer tightening further with Redis only if needed.
 */

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: number; resetAt: number; retryAfterSec: number };

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Test-only: clear all buckets. */
export function resetRateLimitBuckets(): void {
  buckets.clear();
}

/**
 * @param key stable id, e.g. `sync:${userId}`
 * @param limit max successful takes per window
 * @param windowMs window length
 */
export function takeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  if (limit <= 0) {
    return {
      ok: false,
      remaining: 0,
      resetAt: now + windowMs,
      retryAfterSec: Math.ceil(windowMs / 1000),
    };
  }

  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }

  if (b.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: b.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }

  b.count += 1;
  return {
    ok: true,
    remaining: Math.max(0, limit - b.count),
    resetAt: b.resetAt,
  };
}

/** JSON 429 response helper for App Router. */
export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      code: "RATE_LIMITED",
      retryAfterSec: result.retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}

/** Shared third-party budget routes (SEC-4). */
export const RATE_LIMITS = {
  /** Cloud sync burns Anthropic + YouTube; local `npm run sync` is unaffected. */
  sync: { limit: 3, windowMs: 60 * 60 * 1000 },
  /** YouTube playlists.list via refresh=1. */
  playlistsRefresh: { limit: 20, windowMs: 60 * 60 * 1000 },
} as const;
