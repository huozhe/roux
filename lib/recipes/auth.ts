import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/** Session user id or 401 response. */
export async function requireUserId(): Promise<
  string | NextResponse
> {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return userId;
}

export function isUnauthorized(
  v: string | NextResponse,
): v is NextResponse {
  return typeof v !== "string";
}
