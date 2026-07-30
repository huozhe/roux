import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveAppUserId } from "@/lib/recipes/auth";
import { listSyncHistory } from "@/lib/sync";

/**
 * GET /api/sync/history — last N sync_runs for the session user.
 */
export async function GET(req: Request) {
  const session = await auth().catch(() => null);
  const userId = await resolveAppUserId(session?.user?.id);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ runs: [], source: "no_db" as const });
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 100)
    : 20;

  try {
    const runs = await listSyncHistory(userId, limit);
    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load history",
      },
      { status: 500 },
    );
  }
}
