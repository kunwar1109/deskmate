import { SESSION_COOKIE } from "@deskmate/shared/auth";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check before any dashboard page renders: no session cookie at all -> straight to /login,
 * without a round trip to the API. It only checks that the cookie exists, not that it's valid;
 * getCurrentUser() and the API itself do the real check.
 *
 * Deliberately not the reverse ("has cookie on /login -> go to dashboard"): a cookie that exists but is
 * invalid would bounce between the two pages forever.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
