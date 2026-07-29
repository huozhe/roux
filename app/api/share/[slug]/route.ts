import { NextResponse } from "next/server";
import { isUnauthorized, requireUserId } from "@/lib/recipes/auth";
import { revokeShare } from "@/lib/recipes/queries";

type Ctx = { params: Promise<{ slug: string }> };

/** DELETE /api/share/:slug — set revoked_at */
export async function DELETE(_req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (isUnauthorized(userId)) return userId;

  const { slug } = await ctx.params;
  try {
    const result = await revokeShare(userId, slug);
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
