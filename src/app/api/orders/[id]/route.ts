import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/lib/orderService";

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
