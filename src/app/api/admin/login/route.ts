import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Verify against PostgreSQL via Prisma
    let admin = null;
    try {
      admin = await prisma.admin.findUnique({
        where: { username: String(username).trim() },
      });
    } catch (dbError: any) {
      console.error("[Admin Login] Database error:", dbError?.message);
      return NextResponse.json(
        {
          error:
            "Database connection unavailable. Please ensure PostgreSQL is configured and migrations/seeders are run.",
        },
        { status: 503 }
      );
    }

    if (!admin) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const isMatch = await bcrypt.compare(String(password), admin.password);
    if (!isMatch) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Create session response
    const response = NextResponse.json({
      success: true,
      message: "Admin authentication successful",
      admin: {
        id: admin.id,
        username: admin.username,
      },
    });

    // Set secure HTTP-only cookie
    response.cookies.set("admin_token", admin.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error) {
    console.error("[Admin Login API Route Error]:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during login" },
      { status: 500 }
    );
  }
}
