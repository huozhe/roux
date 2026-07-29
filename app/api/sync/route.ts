import { auth } from "@/lib/auth";
import { runSyncForUser, type SyncProgress } from "@/lib/sync";

export const maxDuration = 300;

/**
 * POST /api/sync — manual sync, SSE stages (text/event-stream).
 */
export async function POST() {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!process.env.DATABASE_URL) {
    return new Response(JSON.stringify({ error: "DATABASE_URL not set" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
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
