import { NextResponse } from "next/server";
import {
  RATE_LIMITS,
  rateLimitResponse,
  takeRateLimit,
} from "@/lib/rate-limit";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import {
  createLibraryShare,
  listLibraryShares,
} from "@/lib/recipes/queries";

/** GET /api/library-shares — active guest links for the signed-in user */
export async function GET() {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  try {
    const shares = await listLibraryShares(userId);
    return NextResponse.json({ shares });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to list shares",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/library-shares
 * Body: { label?: string } — who the link is for, display only.
 */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  const rl = takeRateLimit(
    `library-shares:${userId}`,
    RATE_LIMITS.libraryShares.perUser.limit,
    RATE_LIMITS.libraryShares.perUser.windowMs,
  );
  if (!rl.ok) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const raw = (body as { label?: unknown } | null)?.label;
  const label = typeof raw === "string" ? raw : "";

  try {
    const share = await createLibraryShare(userId, label);
    return NextResponse.json(share);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to create share",
      },
      { status: 500 },
    );
  }
}
