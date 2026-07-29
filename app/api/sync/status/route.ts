import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSyncStatusSummary } from "@/lib/sync";

/**
 * GET /api/sync/status — selected playlists, last run, counters.
 */
export async function GET() {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      selectedPlaylists: [],
      lastRun: null,
      unverifiedCount: 0,
      needTranscriptCount: 0,
      source: "no_db" as const,
    });
  }

  try {
    const summary = await getSyncStatusSummary(userId);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load status",
      },
      { status: 500 },
    );
  }
}
