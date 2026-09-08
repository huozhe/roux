import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

/**
 * T1 route guard (Next 16 proxy.ts; replaces deprecated middleware.ts).
 * Guests → /login; authed /login → /. Public: /login, /r/*, /s/*, /api/auth/*
 */
const { auth } = NextAuth(authConfig);

/** Local/dev only: allow fixture UI when OAuth env is missing. Production always fails closed. */
const authConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_SECRET,
);
const isProduction = process.env.NODE_ENV === "production";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const loggedIn = !!req.auth;

  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/r/") ||
    pathname.startsWith("/s/") || // whole-library guest link; token is the credential
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron"); // CRON_SECRET checked in route

  if (!authConfigured) {
    // Never fail open in production (missing/rotated env must not publicize routes).
    if (isProduction) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Auth not configured" },
          { status: 503 },
        );
      }
      return new NextResponse("Auth not configured", { status: 503 });
    }
    return NextResponse.next();
  }

  if (!loggedIn && !isPublic) {
    // Browser fetch("/api/...") must get JSON 401, not a 302→HTML login page.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
