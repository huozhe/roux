import { NextResponse } from "next/server";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import { listGrantedToMe } from "@/lib/recipes/queries";

/** GET /api/recipes/shared — recipes granted to the signed-in user. */
export async function GET() {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  try {
    const recipes = await listGrantedToMe(userId);
    return NextResponse.json({ recipes });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list shared recipes",
      },
      { status: 500 },
    );
  }
}
