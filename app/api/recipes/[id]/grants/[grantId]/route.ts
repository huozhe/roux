import { NextResponse } from "next/server";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import { revokeRecipeGrant } from "@/lib/recipes/queries";

type Ctx = { params: Promise<{ id: string; grantId: string }> };

/**
 * DELETE /api/recipes/:id/grants/:grantId
 * Owner only (authz via recipes.user_id). :id must match the grant's recipe.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  const { id: recipeId, grantId } = await ctx.params;
  try {
    const result = await revokeRecipeGrant(userId, grantId, recipeId);
    if (result === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to revoke grant",
      },
      { status: 500 },
    );
  }
}
