import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const p = prisma as any;

    const payment = await p.payment.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });

    let currentPayment = payment;

    // If payment is pending and has a gatewayPaymentId (pp_id), check directly with PipraPay
    if (currentPayment.status === "PENDING" && currentPayment.gatewayPaymentId) {
      const { verifyWithPipraPay, processPaymentSuccess } = await import("@/lib/piprapayService");
      const verification = await verifyWithPipraPay(currentPayment.gatewayPaymentId);

      if (verification.verified) {
        await processPaymentSuccess({
          paymentId: currentPayment.id,
          gatewayTransactionId: currentPayment.gatewayPaymentId,
          ppId: currentPayment.gatewayPaymentId,
          rawResponse: verification.rawData,
          actorId: "client_verify_poll",
        });

        // Re-fetch updated payment state
        currentPayment = await p.payment.findUnique({
          where: { id },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
              },
            },
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        orderNumber: payment.order?.orderNumber,
        orderStatus: payment.order?.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        verificationStatus: payment.verificationStatus,
        gatewayTransactionId: payment.gatewayTransactionId,
        paidAt: payment.paidAt,
        failedAt: payment.failedAt,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to verify payment status" },
      { status: 500 }
    );
  }
}
