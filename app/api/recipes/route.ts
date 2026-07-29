import { NextResponse } from "next/server";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import {
  listParamsFromRequest,
  listRecipes,
} from "@/lib/recipes/queries";

/** GET /api/recipes?q=&cuisine[]=&main[]=&sort=&dir=&view= */
export async function GET(req: Request) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  try {
    const recipes = await listRecipes(userId, listParamsFromRequest(req));
    return NextResponse.json({ recipes });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to list recipes",
      },
      { status: 500 },
    );
  }
}
