import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── ADMIN PROTECTION ──────────────────────────────────────────────────
  if (
    pathname === "/admin/login" ||
    pathname === "/api/admin/login" ||
    pathname === "/api/admin/impersonate/leave"
  ) {
    return NextResponse.next();
  }

  // Protect /api/admin/* API endpoints (return 401 JSON if unauthenticated)
  if (pathname.startsWith("/api/admin")) {
    const adminToken = request.cookies.get("admin_token");
    if (!adminToken || !adminToken.value) {
      return NextResponse.json(
        { error: "Unauthorized: Admin session required" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // Protect /admin/* UI routes (redirect to login page if unauthenticated)
  if (pathname.startsWith("/admin")) {
    const adminToken = request.cookies.get("admin_token");
    if (!adminToken || !adminToken.value) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ─── RESELLER PROTECTION ────────────────────────────────────────────────
  if (
    pathname === "/reseller/login" ||
    pathname === "/api/reseller/auth/login" ||
    pathname.startsWith("/api/reseller/branding")
  ) {
    return NextResponse.next();
  }

  // Protect /api/reseller/* API endpoints
  if (pathname.startsWith("/api/reseller")) {
    const resellerToken = request.cookies.get("reseller_token");
    if (!resellerToken || !resellerToken.value) {
      return NextResponse.json(
        { error: "Unauthorized: Reseller session required" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // Protect /reseller/* UI routes
  if (pathname.startsWith("/reseller")) {
    const resellerToken = request.cookies.get("reseller_token");
    if (!resellerToken || !resellerToken.value) {
      const loginUrl = new URL("/reseller/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/reseller/:path*",
    "/api/reseller/:path*",
  ],
};
