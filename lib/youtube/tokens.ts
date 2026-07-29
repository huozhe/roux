import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { getDb, users } from "@/lib/db";

type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

/** Exchange stored refresh token for a short-lived Google access token. */
export async function getAccessTokenForUser(userId: string): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({
      refreshToken: users.refreshToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const encrypted = rows[0]?.refreshToken;
  if (!encrypted) {
    throw new Error(
      "No YouTube refresh token on file. Sign out and sign in again with Google (consent).",
    );
  }

  const refreshToken = await decrypt(encrypted);
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) {
    throw new Error("Google token response missing access_token");
  }
  return json.access_token;
}
