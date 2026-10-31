import { NextRequest, NextResponse } from "next/server";

// Protect all /admin/* and /api/admin/* routes except login
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the login page, login API, and impersonate leave through
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

