import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/centralAuth";
import { processPaymentSuccess, verifyWithPipraPay } from "@/lib/piprapayService";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/recharge-return?paymentId=...&pp_id=...
 *
 * Called when PipraPay redirects the customer back after a recharge payment.
 * Verifies the payment with PipraPay's verify-payment endpoint and, if confirmed,
 * triggers the ICC Talk recharge (as a fallback if the webhook hasn't fired yet).
 *
 * Returns the payment status so the frontend can show a result.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getClientSession(req);
    if (!session || !session.customerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get("paymentId");
    const ppId = searchParams.get("pp_id") || searchParams.get("invoice_id");
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
    }

    const p = prisma as any;

    // 1. Fetch payment from DB
    const payment = await p.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Ownership check: payment must belong to the logged-in customer
    if (payment.customerId !== session.customerId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 2. If already COMPLETED, just return current status (webhook already handled it)
    if (payment.status === "COMPLETED") {
      if (payment.rechargeOrderId) {
        const { executeIccRechargeAfterPayment } = await import("@/lib/piprapayService");
        executeIccRechargeAfterPayment({
          paymentId: payment.id,
          rechargeOrderId: payment.rechargeOrderId,
          customerId: payment.customerId,
          amount: Number(payment.amount),
        }).catch((err) => console.error("[ICC Recharge Return Ensure Error]", err));
      }

      return NextResponse.json({
        success: true,
        status: "COMPLETED",
        alreadyProcessed: true,
        paymentId: payment.id,
        rechargeOrderId: payment.rechargeOrderId,
        amount: Number(payment.amount),
        message: "Payment already confirmed. ICC recharge has been dispatched.",
      });
    }

    // 3. Get pp_id: either from URL params (PipraPay sends it on redirect) or from DB
    const effectivePpId = ppId || payment.gatewayPaymentId;

    if (!effectivePpId) {
      return NextResponse.json({
        success: false,
        status: payment.status,
        paymentId: payment.id,
        message: "Payment pending — waiting for gateway confirmation.",
      });
    }

    // 4. Verify with PipraPay
    const verification = await verifyWithPipraPay(effectivePpId);

    if (!verification.verified) {
      return NextResponse.json({
        success: false,
        status: "PENDING",
        paymentId: payment.id,
        ppId: effectivePpId,
        gatewayStatus: verification.status,
        message: "Payment not yet confirmed by gateway. Please wait.",
      });
    }

    // 5. Payment confirmed — process it (this also triggers ICC recharge)
    const result = await processPaymentSuccess({
      paymentId: payment.id,
      gatewayTransactionId: effectivePpId,
      ppId: effectivePpId,
      rawResponse: verification.rawData,
      actorId: "recharge_return",
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      status: "COMPLETED",
      paymentId: payment.id,
      rechargeOrderId: payment.rechargeOrderId,
      amount: Number(payment.amount),
      message: "Payment verified! ICC Talk recharge has been dispatched.",
      alreadyProcessed: result.alreadyProcessed ?? false,
    });
  } catch (error: any) {
    console.error("[Recharge Return API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process payment return" },
      { status: 500 }
    );
  }
}
