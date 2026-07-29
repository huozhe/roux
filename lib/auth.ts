/**
 * T1 Platform: Auth.js v5 Google + JWT session.
 * On sign-in: upsert users row, AES-GCM encrypt refresh_token (TOKEN_ENCRYPTION_KEY).
 * Scopes: openid email profile youtube.readonly; offline + consent for refresh.
 */
import NextAuth from "next-auth";
import { eq } from "drizzle-orm";
import { authConfig } from "@/lib/auth.config";
import { encrypt } from "@/lib/crypto";
import { getDb, users } from "@/lib/db";
import { DEFAULT_PREFS } from "@/lib/types";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      const googleSub = account.providerAccountId;
      const email = profile?.email;
      if (!googleSub || !email) return false;

      const name =
        typeof profile?.name === "string" ? profile.name : null;
      let encrypted: string | null = null;
      if (account.refresh_token) {
        encrypted = await encrypt(account.refresh_token);
      }

      const db = getDb();
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.googleSub, googleSub))
        .limit(1);

      if (existing[0]) {
        await db
          .update(users)
          .set({
            email,
            name,
            ...(encrypted ? { refreshToken: encrypted } : {}),
          })
          .where(eq(users.googleSub, googleSub));
      } else {
        await db.insert(users).values({
          email,
          name,
          googleSub,
          refreshToken: encrypted,
          prefs: DEFAULT_PREFS,
        });
      }
      return true;
    },

    async jwt({ token, account }) {
      const t = token as { uid?: string; sub?: string };
      // Prefer account id on sign-in; otherwise rehydrate from existing JWT.
      const googleSub = account?.providerAccountId ?? t.sub;
      if (!t.uid && googleSub) {
        try {
          const db = getDb();
          const row = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.googleSub, googleSub))
            .limit(1);
          if (row[0]) t.uid = row[0].id;
        } catch {
          /* DB unavailable during edge/build — leave uid unset */
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        const uid = (token as { uid?: string }).uid;
        // Prefer app UUID; never fall back to raw Google sub for API ownership.
        session.user.id = uid ?? "";
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
