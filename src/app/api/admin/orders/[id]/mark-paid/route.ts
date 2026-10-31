import { NextRequest, NextResponse } from "next/server";
import { completeOrder } from "@/lib/orderService";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { notes = "Manual bank transfer / cash verification", transactionReference } = body;

    const p = prisma as any;
    const order = await p.order.findUnique({
      where: { id },
      include: { customer: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status === "PAID") {
      return NextResponse.json({ error: "Order is already marked as paid" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";

    // 1. Create a settled Payment record for administrative reconciliation
    const payment = await p.payment.create({
      data: {
        customerId: order.customerId,
        orderId: order.id,
        gateway: "MANUAL_ADMIN",
        gatewayTransactionId: transactionReference || `MANUAL-${Date.now()}`,
        amount: order.totalAmount,
        currency: order.currency,
        status: "COMPLETED",
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
        paidAt: new Date(),
        notes,
      },
    });

    // 2. Complete order, activate numbers, and create wallets
    const result = await completeOrder({
      orderId: order.id,
      paymentId: payment.id,
      actorId: "admin",
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: "Order successfully marked as paid and numbers activated",
      paymentId: payment.id,
      result,
    });
  } catch (error: any) {
    console.error("[Admin Mark Paid Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to mark order as paid" },
      { status: 500 }
    );
  }
}
