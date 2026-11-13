import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/centralAuth";
import { debitCustomerBalance } from "@/lib/customerBalanceService";
import { completeOrder } from "@/lib/orderService";
import { executeIccRechargeAfterPayment } from "@/lib/piprapayService";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/pay-with-balance
 * Body: {
 *   type: "ORDER" | "RECHARGE",
 *   orderId?: string,
 *   rechargeOrderId?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getClientSession(req);
    if (!session || !session.customerId) {
      return NextResponse.json(
        { error: "Unauthorized: Please log in" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { type, orderId, rechargeOrderId } = body;
    const customerId = session.customerId;
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const p = prisma as any;

    if (type === "ORDER" && orderId) {
      const order = await p.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      if (order.customerId !== customerId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      if (order.status === "PAID") {
        return NextResponse.json({ error: "Order is already paid" }, { status: 400 });
      }

      const totalAmount = Number(order.totalAmount);

      // Debit customer balance
      await debitCustomerBalance({
        customerId,
        amount: totalAmount,
        referenceId: `ORDER-${order.orderNumber || order.id}`,
        description: `Payment for Number Order #${order.orderNumber || order.id}`,
      });

      // Create completed payment record
      const payment = await p.payment.create({
        data: {
          customerId,
          orderId: order.id,
          gateway: "CUSTOMER_BALANCE",
          paymentType: "ORDER",
          amount: totalAmount,
          currency: "BDT",
          status: "COMPLETED",
          verificationStatus: "VERIFIED",
          verifiedAt: new Date(),
          paidAt: new Date(),
          gatewayTransactionId: `BAL-${Date.now()}`,
          notes: "Paid directly using account wallet balance",
        },
      });

      // Complete the order
      const orderResult = await completeOrder({
        orderId: order.id,
        paymentId: payment.id,
        actorId: customerId,
        ipAddress: ip,
      });

      return NextResponse.json({
        success: true,
        message: "Payment completed successfully using your account balance",
        paymentId: payment.id,
        orderResult,
      });
    }

    if (type === "RECHARGE" && rechargeOrderId) {
      const rechargeOrder = await p.rechargeOrder.findUnique({
        where: { id: rechargeOrderId },
      });

      if (!rechargeOrder) {
        return NextResponse.json({ error: "Recharge order not found" }, { status: 404 });
      }

      if (rechargeOrder.customerId !== customerId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      if (rechargeOrder.status === "DONE" || rechargeOrder.status === "COMPLETED") {
        return NextResponse.json({ error: "Recharge is already completed" }, { status: 400 });
      }

      const amount = Number(rechargeOrder.amount);

      // Debit customer balance
      await debitCustomerBalance({
        customerId,
        amount,
        referenceId: `RECHARGE-${rechargeOrder.id}`,
        description: `Payment for Phone Recharge (${rechargeOrder.phone || rechargeOrder.numberId})`,
      });

      // Create completed payment record
      const payment = await p.payment.create({
        data: {
          customerId,
          rechargeOrderId: rechargeOrder.id,
          numberId: rechargeOrder.numberId,
          gateway: "CUSTOMER_BALANCE",
          paymentType: "RECHARGE",
          amount,
          currency: "BDT",
          status: "COMPLETED",
          verificationStatus: "VERIFIED",
          verifiedAt: new Date(),
          paidAt: new Date(),
          gatewayTransactionId: `BAL-REC-${Date.now()}`,
          notes: "Recharge paid using customer account balance",
        },
      });

      // Execute ICC recharge
      executeIccRechargeAfterPayment({
        paymentId: payment.id,
        rechargeOrderId: rechargeOrder.id,
        customerId,
        amount,
      }).catch((err) => console.error("[Recharge After Balance Payment Error]:", err));

      return NextResponse.json({
        success: true,
        message: "Recharge submitted successfully using your account balance",
        paymentId: payment.id,
      });
    }

    return NextResponse.json(
      { error: "Invalid payment request. Specify type 'ORDER' or 'RECHARGE'" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[Pay With Balance Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process payment with balance" },
      { status: 400 }
    );
  }
}
