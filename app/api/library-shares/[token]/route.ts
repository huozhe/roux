import { NextResponse } from "next/server";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import { revokeLibraryShare } from "@/lib/recipes/queries";

type Ctx = { params: Promise<{ token: string }> };

/** DELETE /api/library-shares/:token — cut off one guest */
export async function DELETE(_req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  const { token } = await ctx.params;
  try {
    const result = await revokeLibraryShare(userId, token);
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
        error: err instanceof Error ? err.message : "Failed to revoke share",
      },
      { status: 500 },
    );
  }
}
