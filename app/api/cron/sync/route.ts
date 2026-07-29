import { NextResponse } from "next/server";

/**
 * Cloud cron sync is disabled (YouTube LOGIN_REQUIRED from Vercel IPs).
 * Run on a home machine: npm run sync
 *
 * Kept as a route so old cron configs get a clear response instead of a silent no-op.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error:
        "Cloud playlist sync is disabled. Run on your machine: npm run sync",
      code: "SYNC_LOCAL_ONLY",
    },
    { status: 503 },
  );
}
