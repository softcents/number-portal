import { NextRequest, NextResponse } from "next/server";
import { triggerOrderItemActivation } from "@/lib/orderService";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const p = prisma as any;

    const item = await p.orderItem.findUnique({
      where: { id },
      include: {
        order: true,
        number: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Order item not found" }, { status: 404 });
    }

    if (item.order.status !== "PAID") {
      return NextResponse.json(
        { error: "Cannot activate an item from an unpaid order" },
        { status: 400 }
      );
    }

    // Set item status back to PROCESSING
    await p.orderItem.update({
      where: { id },
      data: {
        status: "PROCESSING",
        failureReason: null,
      },
    });

    if (item.number) {
      await p.number.update({
        where: { id: item.number.id },
        data: {
          status: "PROCESSING",
          activationStatus: "PROCESSING",
        },
      });
    }

    // Trigger activation asynchronously in background
    triggerOrderItemActivation(id, "admin").catch((e) => {
      console.error(`[Admin Retry Activation Error] Item ${id}:`, e);
    });

    return NextResponse.json({
      success: true,
      message: "Activation queued for item",
      itemId: id,
    });
  } catch (err: any) {
    console.error("[Admin Retry Route Error]:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to trigger activation" },
      { status: 500 }
    );
  }
}
