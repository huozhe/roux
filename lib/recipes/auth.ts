import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, users } from "@/lib/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Map session.user.id → roux.users.id.
 * Older JWTs may carry Google `sub` instead of the app UUID.
 */
export async function resolveAppUserId(
  sessionUserId: string | null | undefined,
): Promise<string | null> {
  if (!sessionUserId) return null;
  if (UUID_RE.test(sessionUserId)) return sessionUserId;
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = getDb();
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.googleSub, sessionUserId))
      .limit(1);
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Integration tests inject a fixed app user id (see setTestDb).
 * `undefined` = use real session; `null` = force 401.
 */
let _testUserId: string | null | undefined;

export function setTestUserId(userId: string | null | undefined): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setTestUserId is not available in production");
  }
  _testUserId = userId;
}

/** Session app user id or 401 response. */
export async function requireUserId(): Promise<string | NextResponse> {
  if (_testUserId !== undefined) {
    if (!_testUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return _testUserId;
  }

  const session = await auth().catch(() => null);
  const resolved = await resolveAppUserId(session?.user?.id);
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return resolved;
}

export function isUnauthorized(
  v: string | NextResponse,
): v is NextResponse {
  return typeof v !== "string";
}
