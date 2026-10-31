import { NextRequest, NextResponse } from "next/server";
import { cancelOrder } from "@/lib/orderService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { reason, actorId } = body;

    const ip = req.headers.get("x-forwarded-for") || "unknown";

    const result = await cancelOrder({
      orderId: id,
      actorId: actorId || "customer",
      reason: reason || "User cancelled order",
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: "Order cancelled and numbers released to available inventory",
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to cancel order" },
      { status: 400 }
    );
  }
}
