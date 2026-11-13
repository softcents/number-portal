import { NextRequest, NextResponse } from "next/server";
import { authenticateReseller } from "@/lib/resellerAuth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { usernameOrEmail, password } = body;

    if (!usernameOrEmail || !password) {
      return NextResponse.json(
        { error: "Username/Email and password are required" },
        { status: 400 }
      );
    }

    const result = await authenticateReseller({
      usernameOrEmail,
      password,
    });

    if (!result.success || !result.token || !result.session) {
      return NextResponse.json(
        { error: result.error || "Authentication failed" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Reseller logged in successfully",
      reseller: result.session,
    });

    response.cookies.set("reseller_token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error("[Reseller Login API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
