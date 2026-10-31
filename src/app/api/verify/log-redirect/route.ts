import { NextRequest, NextResponse } from "next/server";
import { recordCentralRedirect } from "@/lib/adminAudit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { jobId, nid, dob } = body;

    await recordCentralRedirect({ jobId, nid, dob });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
