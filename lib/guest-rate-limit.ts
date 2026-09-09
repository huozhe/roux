import { headers } from "next/headers";
import { RATE_LIMITS, takeRateLimit } from "./rate-limit";

/**
 * Per-IP throttle for the two unauthenticated surfaces, `/r/:slug` and
 * `/s/:token`. The link is the only credential a guest has, so the one attack
 * that matters is guessing links in bulk (SEC-5).
 *
 * Lives in the render path, not in `proxy.ts`: proxy may be hoisted to the CDN
 * and must not rely on shared module state, which is exactly what the bucket
 * map is.
 */

/** First hop in `x-forwarded-for`, else `x-real-ip`. */
export function clientIp(
  forwardedFor: string | null,
  realIp: string | null,
): string {
  const first = forwardedFor?.split(",")[0]?.trim();
  if (first) return first;
  return realIp?.trim() || "unknown";
}

/** False when this IP has burned its guest budget for the window. */
export async function guestReadAllowed(): Promise<boolean> {
  const h = await headers();
  const ip = clientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  const { limit, windowMs } = RATE_LIMITS.guestShares.perIp;
  return takeRateLimit(`guest:${ip}`, limit, windowMs).ok;
}
