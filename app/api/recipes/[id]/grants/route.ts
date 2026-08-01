import { NextResponse } from "next/server";
import {
  RATE_LIMITS,
  rateLimitResponse,
  takeRateLimit,
} from "@/lib/rate-limit";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import {
  createRecipeGrant,
  listOutgoingGrants,
} from "@/lib/recipes/queries";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/recipes/:id/grants — active grants for this recipe (owner only). */
export async function GET(_req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  const { id } = await ctx.params;
  try {
    const grants = await listOutgoingGrants(userId, id);
    return NextResponse.json({ grants });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to list grants",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/recipes/:id/grants
 * Body: { email: string } — recipient must already be a Roux user.
 * Unknown email / not owner / self-grant → 404 (no user-enumeration oracle).
 */
export async function POST(req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  const rl = takeRateLimit(
    `recipe-grants:${userId}`,
    RATE_LIMITS.recipeGrants.perUser.limit,
    RATE_LIMITS.recipeGrants.perUser.windowMs,
  );
  if (!rl.ok) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    body &&
    typeof body === "object" &&
    typeof (body as { email?: unknown }).email === "string"
      ? (body as { email: string }).email
      : null;
  if (!email?.trim()) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { id } = await ctx.params;
  try {
    const result = await createRecipeGrant(userId, id, email);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to create grant",
      },
      { status: 500 },
    );
  }
}
