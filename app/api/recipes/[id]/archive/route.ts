import { NextResponse } from "next/server";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import { archiveRecipe } from "@/lib/recipes/queries";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/recipes/:id/archive */
export async function POST(_req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  const { id } = await ctx.params;
  try {
    const recipe = await archiveRecipe(userId, id);
    if (!recipe) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ recipe });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to archive recipe",
      },
      { status: 500 },
    );
  }
}
