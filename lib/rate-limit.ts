/**
 * Fixed-window rate limiter (in-process).
 *
 * Soft under multi-isolate serverless (each isolate has its own map). Enough to
 * stop rapid abuse of shared Google Cloud / Anthropic project quota; not a
 * hard global guarantee without Redis.
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

function maybeEvictExpired(now: number): void {
  if (buckets.size <= 1000) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

function bucketState(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): { count: number; resetAt: number; blocked: boolean } {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    return { count: 0, resetAt: now + windowMs, blocked: limit <= 0 };
  }
  return {
    count: b.count,
    resetAt: b.resetAt,
    blocked: limit <= 0 || b.count >= limit,
  };
}

/**
 * @param key stable id, e.g. `sync:${userId}` or `playlists-refresh:__global__`
 * @param limit max successful takes per window
 * @param windowMs window length
 */
export function takeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  maybeEvictExpired(now);

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

/**
 * Check every entry would pass, then take all (atomic within one isolate).
 * Use for global + per-user caps on a shared third-party budget.
 */
export function takeRateLimitMulti(
  entries: Array<{ key: string; limit: number; windowMs: number }>,
  now = Date.now(),
): RateLimitResult {
  maybeEvictExpired(now);

  for (const e of entries) {
    const st = bucketState(e.key, e.limit, e.windowMs, now);
    if (st.blocked) {
      return {
        ok: false,
        remaining: 0,
        resetAt: st.resetAt,
        retryAfterSec: Math.max(1, Math.ceil((st.resetAt - now) / 1000)),
      };
    }
  }

  let last: RateLimitResult = {
    ok: true,
    remaining: Number.POSITIVE_INFINITY,
    resetAt: now,
  };
  for (const e of entries) {
    last = takeRateLimit(e.key, e.limit, e.windowMs, now);
    if (!last.ok) return last;
  }
  return last;
}

/** JSON 429 response helper for App Router. */
export function rateLimitResponse(
  result: Extract<RateLimitResult, { ok: false }>,
): Response {
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

/**
 * Shared third-party budget routes (SEC-4).
 * YouTube Data API quota is per Google Cloud project (shared AUTH_GOOGLE_ID).
 */
export const RATE_LIMITS = {
  /** Cloud sync — defensive when SYNC_ALLOW_CLOUD=true; local npm run sync free. */
  sync: {
    perUser: { limit: 3, windowMs: 60 * 60 * 1000 },
    global: { limit: 10, windowMs: 60 * 60 * 1000 },
  },
  /**
   * YouTube playlists.list via refresh=1.
   * Per-user alone does not bound project quota (~10k units/day shared).
   */
  playlistsRefresh: {
    perUser: { limit: 5, windowMs: 60 * 60 * 1000 },
    global: { limit: 100, windowMs: 60 * 60 * 1000 },
  },
  /** Create inter-user grants (spam / abuse). */
  recipeGrants: {
    perUser: { limit: 30, windowMs: 60 * 60 * 1000 },
  },
  /** Mint whole-library guest links. */
  libraryShares: {
    perUser: { limit: 20, windowMs: 60 * 60 * 1000 },
  },
  /**
   * Guest reads of `/r/:slug` and `/s/:token` (SEC-5).
   * Keyed per IP. Bounds slug guessing: 8-hex slugs are 32 bits, so 100/min
   * leaves a scanner ~81 years per slug space. Far above real browsing.
   */
  guestShares: {
    perIp: { limit: 100, windowMs: 60 * 1000 },
  },
} as const;
