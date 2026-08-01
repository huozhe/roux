import { auth } from "@/lib/auth";
import {
  RATE_LIMITS,
  rateLimitResponse,
  takeRateLimit,
} from "@/lib/rate-limit";
import { resolveAppUserId } from "@/lib/recipes/auth";
import { runSyncForUser, type SyncProgress } from "@/lib/sync";

export const maxDuration = 300;

/**
 * POST /api/sync — manual sync, SSE stages (text/event-stream).
 *
 * On Vercel, disabled by default: YouTube returns LOGIN_REQUIRED from
 * datacenter IPs. Run captions+extract on your machine instead:
 *   npm run sync
 * Set SYNC_ALLOW_CLOUD=true only if you accept cookie/proxy tradeoffs.
 */
export async function POST() {
  const session = await auth().catch(() => null);
  const userId = await resolveAppUserId(session?.user?.id);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // SEC-4: shared ANTHROPIC_API_KEY — cap cloud sync per user.
  const rl = takeRateLimit(
    `sync:${userId}`,
    RATE_LIMITS.sync.limit,
    RATE_LIMITS.sync.windowMs,
  );
  if (!rl.ok) return rateLimitResponse(rl);

  if (!process.env.DATABASE_URL) {
    return new Response(JSON.stringify({ error: "DATABASE_URL not set" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const onVercel = process.env.VERCEL === "1";
  const allowCloud = process.env.SYNC_ALLOW_CLOUD === "true";
  if (onVercel && !allowCloud) {
    return new Response(
      JSON.stringify({
        error:
          "Cloud sync is disabled: YouTube blocks caption access from Vercel. On your laptop (with .env.local) run: npm run sync",
        code: "SYNC_LOCAL_ONLY",
        hint: "npm run sync",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        send("stage", { stage: "Starting sync…" } satisfies SyncProgress);

        const result = await runSyncForUser(userId, {
          onProgress: (p) => send("stage", p),
        });

        send("done", result);
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
