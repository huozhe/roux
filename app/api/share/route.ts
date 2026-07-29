import { NextResponse } from "next/server";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import { listShareLinks } from "@/lib/recipes/queries";

/** GET /api/share — active share links for the signed-in user */
export async function GET() {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  try {
    const links = await listShareLinks(userId);
    return NextResponse.json({ links });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to list shares",
      },
      { status: 500 },
    );
  }
}
