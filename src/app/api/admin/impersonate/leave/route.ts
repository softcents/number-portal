import { NextRequest, NextResponse } from "next/server";

// POST /api/admin/impersonate/leave — End impersonation and clear customer session
export async function POST(req: NextRequest) {
  try {
    const response = NextResponse.json({
      success: true,
      message: "Impersonation session ended",
      redirectTo: "/admin/customers",
    });

    // Clear customer_token
    response.cookies.set("customer_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });

    // Clear impersonation_session
    response.cookies.set("impersonation_session", "", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });

    return response;
  } catch (error: any) {
    console.error("[Leave Impersonate API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to exit impersonation" },
      { status: 500 }
    );
  }
}

// GET /api/admin/impersonate/leave — Browser direct navigation to exit impersonation
export async function GET(req: NextRequest) {
  const targetUrl = new URL("/admin/customers", req.url);
  const response = NextResponse.redirect(targetUrl);

  // Clear customer_token
  response.cookies.set("customer_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  // Clear impersonation_session
  response.cookies.set("impersonation_session", "", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
