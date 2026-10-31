import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { completeOrder } from "@/lib/orderService";
import { creditWallet } from "@/lib/walletService";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const p = prisma as any;
    const payment = await p.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            customer: true,
            items: { include: { number: true } },
          },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, payment });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch payment" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { status: newStatus, reason = "Admin manual update", notes } = body;

    const p = prisma as any;
    const payment = await p.payment.findUnique({ where: { id } });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const now = new Date();
    const updated = await p.$transaction(async (tx: any) => {
      const up = await tx.payment.update({
        where: { id },
        data: {
          status: newStatus,
          notes: notes ? `${payment.notes ? payment.notes + "; " : ""}${notes}` : payment.notes,
          ...(newStatus === "COMPLETED" ? { verifiedAt: now, paidAt: now, verificationStatus: "VERIFIED" } : {}),
          ...(newStatus === "FAILED" ? { failedAt: now } : {}),
          ...(newStatus === "REFUNDED" ? { refundedAt: now } : {}),
          updatedAt: now,
        },
      });

      await tx.paymentAuditLog.create({
        data: {
          paymentId: id,
          oldStatus: payment.status,
          newStatus,
          oldAmount: payment.amount,
          newAmount: payment.amount,
          action: "ADMIN_MANUAL_STATUS_UPDATE",
          reason,
          adminId: "admin",
          metadata: { notes },
        },
      });

      return up;
    });

    // If marked completed, trigger order processing or wallet credit
    if (newStatus === "COMPLETED" && payment.status !== "COMPLETED") {
      if (payment.orderId) {
        await completeOrder({
          orderId: payment.orderId,
          paymentId: id,
          actorId: "admin",
        });
      }
      if (payment.walletId) {
        await creditWallet({
          walletId: payment.walletId,
          amount: Number(payment.amount),
          transactionType: "RECHARGE",
          reference: `ADMIN-${Date.now()}`,
          paymentId: id,
          notes: `Admin manually approved recharge: ${reason}`,
          actorId: "admin",
        });
      }
    }

    return NextResponse.json({ success: true, payment: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update payment status" },
      { status: 500 }
    );
  }
}
