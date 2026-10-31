import { NextRequest, NextResponse } from "next/server";
import { getAllSearches } from "@/lib/adminAudit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "ALL";
    const query = searchParams.get("query") || "";

    const searches = await getAllSearches({ status, query });
    return NextResponse.json({ searches });
  } catch (error) {
    console.error("[Admin Searches Error]:", error);
    return NextResponse.json(
      { error: "Failed to fetch searches" },
      { status: 500 }
    );
  }
}
