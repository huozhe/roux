import { NextResponse } from "next/server";
import { purgeArchivedRecipes } from "@/lib/sync";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/**
 * GET /api/cron/purge — Bearer CRON_SECRET;
 * hard-delete recipes archived >30d; write recipe_tombstones.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }

  try {
    const result = await purgeArchivedRecipes(30);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Purge failed",
      },
      { status: 500 },
    );
  }
}
