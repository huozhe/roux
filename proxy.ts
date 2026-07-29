import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

/**
 * T1 route guard (Next 16 proxy.ts; replaces deprecated middleware.ts).
 * Guests → /login; authed /login → /. Public: /login, /r/*, /api/auth/*
 */
const { auth } = NextAuth(authConfig);

/** Until Google OAuth env is set, allow fixture UI without login (local/dev). */
const authConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_SECRET,
);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const loggedIn = !!req.auth;

  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/r/") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron"); // CRON_SECRET checked in route

  if (!authConfigured) {
    return NextResponse.next();
  }

  if (!loggedIn && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (loggedIn && (pathname === "/login" || pathname.startsWith("/login/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Skip Next internals and static assets.
     * Keep /api/* except we still want auth routes public (handled above).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
