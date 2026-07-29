import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveAppUserId } from "@/lib/recipes/auth";
import {
  backfillCaptionSkipsFromLastRun,
  listCaptionSkips,
} from "@/lib/sync/caption-skips";

/**
 * GET /api/sync/caption-skips
 * Persisted no_captions + auth_blocked videos (skipped on future syncs).
 */
export async function GET() {
  const session = await auth().catch(() => null);
  const userId = await resolveAppUserId(session?.user?.id);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ items: [], source: "no_db" as const });
  }

  try {
    // One-shot backfill from recent sync run details (idempotent upserts).
    await backfillCaptionSkipsFromLastRun(userId).catch(() => 0);
    const items = await listCaptionSkips(userId);
    const noCaptions = items.filter((i) => i.kind === "no_captions");
    const authBlocked = items.filter((i) => i.kind === "auth_blocked");
    return NextResponse.json({
      items,
      groups: {
        no_captions: noCaptions,
        auth_blocked: authBlocked,
      },
      counts: {
        no_captions: noCaptions.length,
        auth_blocked: authBlocked.length,
        total: items.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list caption skips",
      },
      { status: 500 },
    );
  }
}
