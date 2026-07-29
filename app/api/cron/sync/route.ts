import { NextResponse } from "next/server";
import {
  listUserIdsWithSelectedPlaylists,
  runSyncForUser,
} from "@/lib/sync";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/**
 * GET /api/cron/sync — Bearer CRON_SECRET; sync users with selected playlists.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }

  // Keep each user small so the whole cron stays under serverless limits.
  const maxNewVideos = Number(process.env.SYNC_CRON_MAX_NEW ?? "3") || 3;

  try {
    const userIds = await listUserIdsWithSelectedPlaylists();
    const results: Array<{
      userId: string;
      found: number;
      written: number;
      skipped: number;
      result: string;
    }> = [];

    for (const userId of userIds) {
      try {
        const r = await runSyncForUser(userId, { maxNewVideos });
        results.push({
          userId,
          found: r.found,
          written: r.written,
          skipped: r.skipped,
          result: r.result,
        });
      } catch (err) {
        results.push({
          userId,
          found: 0,
          written: 0,
          skipped: 0,
          result: err instanceof Error ? err.message : "error",
        });
      }
    }

    return NextResponse.json({
      users: userIds.length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Cron sync failed",
      },
      { status: 500 },
    );
  }
}
