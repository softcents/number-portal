import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeIccRechargeAfterPayment, normalizeIccPhone } from "@/lib/piprapayService";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/recharges/retry
 *
 * Admin-only action: Re-runs the recharge job exactly once.
 * Strictly refuses if a recharge for that order already succeeded.
 *
 * Body: { transactionId?: string, rechargeOrderId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    // ── 1. Admin Authorization Verification ────────────────────────────────────
    const adminToken = req.cookies.get("admin_token")?.value;
    if (!adminToken) {
      return NextResponse.json(
        { error: "Unauthorized: Admin session required" },
        { status: 401 }
      );
    }

    const admin = await prisma.admin.findUnique({
      where: { id: adminToken },
    });
    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid admin session" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { transactionId, rechargeOrderId } = body;

    if (!transactionId && !rechargeOrderId) {
      return NextResponse.json(
        { error: "transactionId or rechargeOrderId is required" },
        { status: 400 }
      );
    }

    const p = prisma as any;

    // ── 2. Handle by transactionId ─────────────────────────────────────────────
    if (transactionId) {
      const tx = await p.rechargeTransaction.findUnique({
        where: { id: transactionId },
        include: { number: { include: { provider: { include: { credential: true } } } } },
      });

      if (!tx) {
        return NextResponse.json(
          { error: "Recharge transaction not found" },
          { status: 404 }
        );
      }

      // Refuse if this transaction already succeeded
      if (tx.status === "DONE") {
        return NextResponse.json(
          { error: "Recharge for this transaction has already succeeded. Cannot retry." },
          { status: 400 }
        );
      }

      // If associated with a paid recharge
      if (tx.idempotencyKey?.startsWith("paid_recharge_")) {
        const paymentId = tx.idempotencyKey
          .replace("paid_recharge_", "")
          .split("_retry_")[0];

        const payment = await p.payment.findUnique({
          where: { id: paymentId },
        });

        if (!payment) {
          return NextResponse.json(
            { error: "Associated payment record not found" },
            { status: 404 }
          );
        }

        if (payment.status !== "COMPLETED") {
          return NextResponse.json(
            { error: `Payment is not completed (current status: ${payment.status}). Cannot execute recharge.` },
            { status: 400 }
          );
        }

        if (payment.rechargeOrderId) {
          const rechargeOrder = await p.rechargeOrder.findUnique({
            where: { id: payment.rechargeOrderId },
          });

          // Refuse if order already succeeded
          if (rechargeOrder && (rechargeOrder.status === "DONE" || rechargeOrder.status === "COMPLETED")) {
            return NextResponse.json(
              { error: "Recharge for this order has already succeeded. Cannot retry." },
              { status: 400 }
            );
          }

          // Re-run the recharge job exactly once with forceRetry = true
          const retryResult = await executeIccRechargeAfterPayment({
            paymentId: payment.id,
            rechargeOrderId: payment.rechargeOrderId,
            customerId: payment.customerId,
            amount: Number(payment.amount),
            forceRetry: true,
          });

          if (!retryResult.success) {
            return NextResponse.json(
              { error: retryResult.reason || "Retry dispatch failed" },
              { status: 500 }
            );
          }

          return NextResponse.json({
            success: true,
            message: "Recharge job successfully re-dispatched to worker.",
            jobId: retryResult.jobId,
          });
        }
      }

      // If standalone transaction without payment linkage:
      const workerUrl = process.env.WORKER_URL || "http://127.0.0.1:8001";
      const workerSecret =
        process.env.WORKER_SECRET ||
        "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

      const phone = normalizeIccPhone(tx.number?.number || tx.phone);
      const retryIdempotency = `retry_${tx.id}_${Date.now()}`;

      let prov = tx.number?.provider;
      if (!prov) {
        if (phone.startsWith("09617")) {
          prov = await p.provider.findUnique({
            where: { code: "RANKSITT" },
            include: { credential: true },
          });
        } else if (phone.startsWith("09644")) {
          prov = await p.provider.findUnique({
            where: { code: "ICON" },
            include: { credential: true },
          });
        } else {
          prov = await p.provider.findUnique({
            where: { code: "ICC" },
            include: { credential: true },
          });
        }
      }

      const providerCode = prov?.code || (phone.startsWith("09617") ? "RANKSITT" : phone.startsWith("09644") ? "ICON" : "ICC");
      const rechargeLoginUrl = prov?.rechargeLoginUrl;
      const rechargeUsername = prov?.credential?.rechargeUsername;
      const rechargePassword = prov?.credential?.rechargeEncryptedPassword
        ? Buffer.from(prov.credential.rechargeEncryptedPassword, "base64").toString("utf-8")
        : undefined;

      const workerRes = await fetch(`${workerUrl}/recharge-jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": workerSecret,
        },
        body: JSON.stringify({
          phone,
          amount: Number(tx.amount),
          idempotencyKey: retryIdempotency,
          provider: providerCode,
          loginUrl: rechargeLoginUrl,
          username: rechargeUsername,
          password: rechargePassword,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!workerRes.ok) {
        const errText = await workerRes.text().catch(() => "");
        return NextResponse.json(
          { error: `Worker error: ${errText || workerRes.status}` },
          { status: 500 }
        );
      }

      const workerData = await workerRes.json();
      const workerJobId = workerData.rechargeJobId;

      await p.rechargeTransaction.update({
        where: { id: tx.id },
        data: {
          jobId: workerJobId,
          status: "PENDING",
          reason: "admin_retry_dispatched",
        },
      });

      const { finalizeRechargeJob } = await import("@/lib/rechargeService");
      if (workerJobId) {
        finalizeRechargeJob(tx.id, workerJobId).catch((e) =>
          console.error("[Admin Retry Finalizer Error]", e)
        );
      }

      return NextResponse.json({
        success: true,
        message: "Recharge job successfully re-dispatched to worker.",
        jobId: workerJobId,
      });
    }

    // ── 3. Handle by rechargeOrderId ───────────────────────────────────────────
    if (rechargeOrderId) {
      const rechargeOrder = await p.rechargeOrder.findUnique({
        where: { id: rechargeOrderId },
      });

      if (!rechargeOrder) {
        return NextResponse.json(
          { error: "Recharge order not found" },
          { status: 404 }
        );
      }

      // Refuse if already succeeded
      if (rechargeOrder.status === "DONE" || rechargeOrder.status === "COMPLETED") {
        return NextResponse.json(
          { error: "Recharge for this order has already succeeded. Cannot retry." },
          { status: 400 }
        );
      }

      const payment = await p.payment.findFirst({
        where: { rechargeOrderId },
        orderBy: { createdAt: "desc" },
      });

      if (!payment || payment.status !== "COMPLETED") {
        return NextResponse.json(
          { error: "No confirmed payment found for this recharge order. Cannot execute recharge." },
          { status: 400 }
        );
      }

      const retryResult = await executeIccRechargeAfterPayment({
        paymentId: payment.id,
        rechargeOrderId: rechargeOrder.id,
        customerId: rechargeOrder.customerId,
        amount: Number(rechargeOrder.amount),
        forceRetry: true,
      });

      if (!retryResult.success) {
        return NextResponse.json(
          { error: retryResult.reason || "Retry dispatch failed" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Recharge job successfully re-dispatched to worker.",
        jobId: retryResult.jobId,
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error: any) {
    console.error("[Admin Recharge Retry Error]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to retry recharge" },
      { status: 500 }
    );
  }
}
