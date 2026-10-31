import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/numbers/[id]/history — status history for a number
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const p = prisma as any;
    const history = await p.numberStatusHistory.findMany({
      where: { numberId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(history);
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
