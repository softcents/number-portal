import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";

export async function GET(req: NextRequest) {
  try {
    const session = await getResellerSession(req);

    if (!session) {
      return NextResponse.json({ authenticated: false, error: "Not authenticated" }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      reseller: session,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
