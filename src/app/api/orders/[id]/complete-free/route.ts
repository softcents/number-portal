import { NextRequest, NextResponse } from "next/server";
import { completeOrder } from "@/lib/orderService";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/orders/[id]/complete-free
 *
 * Completes a zero-amount order instantly, without going through a payment
 * gateway. Only allowed when the order's totalAmount is 0.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const p = prisma as any;

    // 1. Fetch the order and verify it is free
    const order = await p.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status === "PAID") {
      return NextResponse.json({ success: true, alreadyPaid: true, orderId });
    }

    if (order.status === "CANCELLED" || order.status === "EXPIRED") {
      return NextResponse.json(
        { error: `Order is ${order.status.toLowerCase()} and cannot be completed` },
        { status: 400 }
      );
    }

    const totalAmount = Number(order.totalAmount ?? 0);
    if (totalAmount > 0) {
      return NextResponse.json(
        { error: "This order is not free. Please use the payment gateway." },
        { status: 400 }
      );
    }

    // 2. Create a ৳0 "FREE" payment record so the existing completeOrder
    //    flow works without modification (it expects a paymentId).
    const freePayment = await p.payment.create({
      data: {
        customerId: order.customerId,
        orderId: order.id,
        gateway: "FREE",
        amount: 0,
        currency: "BDT",
        status: "COMPLETED",
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
        paidAt: new Date(),
        gatewayTransactionId: `FREE-${orderId}-${Date.now()}`,
        notes: "Zero-cost number — no payment required",
      },
    });

    // 3. Audit log
    await p.paymentAuditLog.create({
      data: {
        paymentId: freePayment.id,
        oldStatus: null,
        newStatus: "COMPLETED",
        oldAmount: null,
        newAmount: 0,
        action: "FREE_ORDER_COMPLETE",
        reason: "Number price is ৳0 — instant assignment without gateway",
        ipAddress: ip,
      },
    });

    // 4. Run the standard order-completion flow (reserves → PROCESSING → ACTIVE)
    const result = await completeOrder({
      orderId,
      paymentId: freePayment.id,
      actorId: order.customerId,
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      orderId,
      paymentId: freePayment.id,
      message: "Free number assigned successfully. Activating with provider…",
      result,
    });
  } catch (error: any) {
    console.error("[Complete Free Order Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to complete free order" },
      { status: 500 }
    );
  }
}