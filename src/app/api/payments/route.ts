import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/centralAuth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let customerId = searchParams.get("customerId");

    // If customerId is not in searchParams, try reading from client session cookie
    if (!customerId) {
      const session = await getClientSession(req);
      if (session?.customerId) {
        customerId = session.customerId;
      }
    }

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId query parameter or session is required" },
        { status: 400 }
      );
    }

    const p = prisma as any;

    const [payments, recharges] = await Promise.all([
      // 1. Number Acquiring & Checkout Payments
      p.payment.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          order: {
            select: { id: true, orderNumber: true, totalAmount: true },
          },
        },
      }),

      // 2. Number Top-Up & Balance Recharge Transactions
      p.rechargeTransaction.findMany({
        where: {
          OR: [
            { userId: customerId },
            { number: { customerId: customerId } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          number: {
            select: {
              id: true,
              number: true,
              normalizedNumber: true,
              customerId: true,
              displayCompany: { select: { name: true, code: true } },
            },
          },
          customer: {
            select: {
              id: true,
              fullName: true,
              email: true,
              companyName: true,
              phoneNumber: true,
            },
          },
        },
      }),
    ]);

    const formattedPayments = payments.map((pay: any) => ({
      id: pay.id,
      amount: Number(pay.amount),
      currency: pay.currency,
      gateway: pay.gateway,
      gatewayTransactionId: pay.gatewayTransactionId || pay.gatewayPaymentId,
      status: pay.status,
      verificationStatus: pay.verificationStatus,
      paidAt: pay.paidAt,
      createdAt: pay.createdAt,
      orderNumber: pay.order?.orderNumber || null,
      isRecharge: !pay.orderId,
    }));

    const formattedRecharges = recharges.map((r: any) => {
      const isSuccess = r.status === "DONE" || r.status === "UNCERTAIN";
      return {
        id: r.id,
        phone: r.phone,
        number: r.number?.number || r.phone,
        amount: Number(r.amount),
        // Succeeded = "Success", else "Failed" / "Uncertain" / "Pending"
        status: isSuccess ? "Success" : r.status === "ERROR" ? "Failed" : r.status === "UNCERTAIN" ? "Uncertain" : "Pending",
        rawStatus: r.status,
        isSuccess,
        // Cause of failure drawn from API response
        reason: r.reason || null,
        // Balance breakdown: Previous balance before top-up, Top-up balance, Number balance after top-up
        balanceBefore: r.balanceBefore !== null && r.balanceBefore !== undefined ? Number(r.balanceBefore) : null,
        balanceAfter: r.balanceAfter !== null && r.balanceAfter !== undefined ? Number(r.balanceAfter) : null,
        // Customer / Allocatee details
        customerName: r.customer?.fullName || "User",
        customerEmail: r.customer?.email || "",
        companyName: r.customer?.companyName?.trim() || null, // Omitted if empty or not given
        displayCompany: r.number?.displayCompany?.code || r.number?.number?.slice(0, 5) || null,
        idempotencyKey: r.idempotencyKey || null,
        jobId: r.jobId || null,
        durationMs: r.durationMs || null,
        reference: r.reference || null,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      };
    });

    return NextResponse.json({
      success: true,
      payments: formattedPayments,
      recharges: formattedRecharges,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch customer payments & recharge history" },
      { status: 500 }
    );
  }
}
