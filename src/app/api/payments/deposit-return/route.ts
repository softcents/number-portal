import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/centralAuth";
import { processPaymentSuccess, verifyWithPipraPay } from "@/lib/piprapayService";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/deposit-return?paymentId=...&pp_id=...
 *
 * Verifies the customer's wallet deposit payment with PipraPay and ensures
 * the balance is automatically added to the customer's account.
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

    const payment = await p.payment.findUnique({
      where: { id: paymentId },
      include: {
        reseller: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.customerId !== session.customerId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // If already COMPLETED, fetch current balance and return
    if (payment.status === "COMPLETED") {
      const customer = await p.customer.findUnique({
        where: { id: session.customerId },
        select: { balance: true },
      });
      return NextResponse.json({
        success: true,
        status: "COMPLETED",
        paymentId: payment.id,
        amount: Number(payment.amount),
        balance: Number(customer?.balance || 0),
        message: "Balance successfully added",
      });
    }

    // Verify with PipraPay
    const effectivePpId = ppId || payment.gatewayPaymentId;
    if (!effectivePpId) {
      return NextResponse.json({
        success: false,
        status: payment.status,
        message: "Payment awaiting gateway confirmation",
      });
    }

    const verification = await verifyWithPipraPay(effectivePpId);

    if (verification.verified) {
      const result = await processPaymentSuccess({
        paymentId: payment.id,
        gatewayTransactionId:
          verification.rawData?.transaction_id ||
          verification.rawData?.trx_id ||
          effectivePpId,
        ppId: effectivePpId,
        rawResponse: verification.rawData,
        actorId: "customer_deposit_return",
        ipAddress: ip,
      });

      const customer = await p.customer.findUnique({
        where: { id: session.customerId },
        select: { balance: true },
      });

      return NextResponse.json({
        success: true,
        status: "COMPLETED",
        paymentId: payment.id,
        amount: Number(payment.amount),
        balance: Number(customer?.balance || 0),
        message: "Balance successfully credited to your account",
        result,
      });
    }

    return NextResponse.json({
      success: false,
      status: payment.status,
      gatewayStatus: verification.status || "unverified",
      message: "Payment verification pending",
    });
  } catch (error: any) {
    console.error("[Deposit Return Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process deposit return" },
      { status: 500 }
    );
  }
}
