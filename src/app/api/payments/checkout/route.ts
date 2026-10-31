import { NextRequest, NextResponse } from "next/server";
import { createCheckoutSession } from "@/lib/piprapayService";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, rechargeOrderId, customerId, amount } = body;

    const p = prisma as any;
    let finalCustomerId = customerId;
    let finalAmount = amount;
    let customerName = "Valued Customer";
    let customerEmail = "customer@softcents.com";
    let customerPhone = "";

    // If orderId is provided, pull customer and amount from Order
    if (orderId) {
      const order = await p.order.findUnique({
        where: { id: orderId },
        include: { customer: true },
      });

      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      if (order.status === "PAID") {
        return NextResponse.json(
          { error: "Order is already paid" },
          { status: 400 }
        );
      }

      if (order.status === "CANCELLED" || order.status === "EXPIRED") {
        return NextResponse.json(
          { error: `Order is ${order.status.toLowerCase()} and cannot be paid` },
          { status: 400 }
        );
      }

      finalCustomerId = order.customerId;
      finalAmount = Number(order.totalAmount);
      if (order.customer) {
        customerName = order.customer.fullName;
        customerEmail = order.customer.email;
        customerPhone = order.customer.phoneNumber || "";
      }
    } else if (rechargeOrderId) {
      const recharge = await p.rechargeOrder.findUnique({
        where: { id: rechargeOrderId },
        include: { customer: true },
      });

      if (!recharge) {
        return NextResponse.json({ error: "Recharge order not found" }, { status: 404 });
      }

      finalCustomerId = recharge.customerId;
      finalAmount = Number(recharge.amount);
      if (recharge.customer) {
        customerName = recharge.customer.fullName;
        customerEmail = recharge.customer.email;
        customerPhone = recharge.customer.phoneNumber || "";
      }
    }

    if (!finalCustomerId) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";

    // Special case: If order total is 0 BDT (free number), complete immediately without payment gateway!
    if (orderId && Number(finalAmount ?? 0) <= 0) {
      const freePayment = await p.payment.create({
        data: {
          customerId: finalCustomerId,
          orderId,
          gateway: "FREE",
          amount: 0,
          currency: "BDT",
          status: "COMPLETED",
          verificationStatus: "VERIFIED",
          verifiedAt: new Date(),
          paidAt: new Date(),
          gatewayTransactionId: `FREE-${orderId}-${Date.now()}`,
          notes: "Zero-cost number — instant assignment without gateway",
        },
      });

      await p.paymentAuditLog.create({
        data: {
          paymentId: freePayment.id,
          oldStatus: null,
          newStatus: "COMPLETED",
          oldAmount: null,
          newAmount: 0,
          action: "FREE_ORDER_COMPLETE",
          reason: "Order price is ৳0 BDT — instant claim without gateway",
          ipAddress: ip,
        },
      });

      const { completeOrder } = await import("@/lib/orderService");
      const result = await completeOrder({
        orderId,
        paymentId: freePayment.id,
        actorId: finalCustomerId,
        ipAddress: ip,
      });

      return NextResponse.json({
        success: true,
        isFree: true,
        orderId,
        paymentId: freePayment.id,
        message: "Free number claimed successfully",
        result,
      });
    }

    if (!finalAmount || finalAmount <= 0) {
      return NextResponse.json(
        { error: "Payment amount must be greater than 0" },
        { status: 400 }
      );
    }

    const session = await createCheckoutSession({
      customerId: finalCustomerId,
      orderId,
      rechargeOrderId,
      amount: finalAmount,
      customerName,
      customerEmail,
      customerPhone,
      ipAddress: ip,
    });

    return NextResponse.json({
      ...session,
    });
  } catch (error: any) {
    console.error("[Payment Checkout API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to initiate payment" },
      { status: 500 }
    );
  }
}
