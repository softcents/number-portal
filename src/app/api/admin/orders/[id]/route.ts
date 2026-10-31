import { NextRequest, NextResponse } from "next/server";
import { getOrderById, cancelOrder } from "@/lib/orderService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const order = await getOrderById(id);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch order detail" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || "Cancelled by administrator";

    const ip = req.headers.get("x-forwarded-for") || "unknown";

    const result = await cancelOrder({
      orderId: id,
      actorId: "admin",
      reason,
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: "Order successfully cancelled and numbers released",
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to cancel order" },
      { status: 400 }
    );
  }
}
