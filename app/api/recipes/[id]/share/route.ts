import { NextResponse } from "next/server";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import { shareRecipe } from "@/lib/recipes/queries";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/recipes/:id/share → { slug } (idempotent) */
export async function POST(_req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  const { id } = await ctx.params;
  try {
    const result = await shareRecipe(userId, id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to share recipe",
      },
      { status: 500 },
    );
  }
}
