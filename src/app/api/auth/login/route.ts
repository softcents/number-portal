import { NextRequest, NextResponse } from "next/server";
import { authenticateCentralCredentials } from "@/lib/centralAuth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";

    const result = await authenticateCentralCredentials({
      email,
      password,
      ipAddress: ip,
    });

    if (!result.success || !result.token) {
      return NextResponse.json(
        { error: result.error || "Authentication failed" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Signed in successfully with Central Identity",
      user: result.session,
    });

    // Set secure HTTP-only cookie for the customer session
    response.cookies.set("customer_token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error("[Central Login API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Internal authentication error" },
      { status: 500 }
    );
  }
}
