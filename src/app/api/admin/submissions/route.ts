import { NextRequest, NextResponse } from "next/server";
import { getAllSubmissions } from "@/lib/adminAudit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "ALL";
    const query = searchParams.get("query") || "";

    const submissions = await getAllSubmissions({ status, query });
    return NextResponse.json({ submissions });
  } catch (error) {
    console.error("[Admin Submissions Error]:", error);
    return NextResponse.json(
      { error: "Failed to fetch ICC submissions" },
      { status: 500 }
    );
  }
}
