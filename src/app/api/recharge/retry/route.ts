import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/centralAuth";
import { finalizeRechargeJob, normalizeIccPhone } from "@/lib/rechargeService";

export const dynamic = "force-dynamic";

/**
 * POST /api/recharge/retry
 *
 * Customer-facing recharge retry for ERROR rows only.
 *
 * Guards (all enforced server-side; client sends only { rechargeId }):
 *  1. Caller owns the row  (userId === session.customerId)
 *  2. Row status is exactly ERROR  (never UNCERTAIN / DONE / PENDING)
 *  3. The linked payment (via idempotencyKey) is COMPLETED
 *  4. No DONE recharge transaction exists for the same payment
 *  5. Retry attempts for this payment are under 5
 *  6. Row is claimed atomically with updateMany(where: { id, status: "ERROR" })
 *
 * Amount and phone are taken exclusively from the DB row, never from the request.
 * No new payment is created. PipraPay / webhook / checkout code is untouched.
 */
export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const session = await getClientSession(req);
    if (!session?.customerId) {
      return NextResponse.json({ error: "Unauthorized: Please log in" }, { status: 401 });
    }
    const userId = session.customerId;

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { rechargeId } = body as { rechargeId?: string };

    if (!rechargeId || typeof rechargeId !== "string") {
      return NextResponse.json({ error: "rechargeId is required" }, { status: 400 });
    }

    const p = prisma as any;

    // ── 1. Fetch the transaction ───────────────────────────────────────────────
    const tx = await p.rechargeTransaction.findUnique({
      where: { id: rechargeId },
      include: {
        number: { include: { provider: { include: { credential: true } } } },
      },
    });

    if (!tx) {
      return NextResponse.json({ error: "Recharge transaction not found" }, { status: 404 });
    }

    // ── 2. Ownership check ────────────────────────────────────────────────────
    if (tx.userId !== userId) {
      return NextResponse.json({ error: "Access denied: This recharge does not belong to you" }, { status: 403 });
    }

    // ── 3. Status must be exactly ERROR ───────────────────────────────────────
    if (tx.status !== "ERROR") {
      const friendly: Record<string, string> = {
        DONE: "This recharge already succeeded.",
        UNCERTAIN: "This recharge is under review and cannot be retried yet. Please contact support.",
        PENDING: "This recharge is still in progress.",
      };
      return NextResponse.json(
        { error: friendly[tx.status] || `Cannot retry a ${tx.status} recharge.` },
        { status: 400 }
      );
    }

    // ── 4. Must be linked to a completed payment ───────────────────────────────
    // idempotencyKey format: "paid_recharge_<paymentId>" or "paid_recharge_<paymentId>_retry_<n>"
    let paymentId: string | null = null;
    if (tx.idempotencyKey?.startsWith("paid_recharge_")) {
      paymentId = tx.idempotencyKey.replace("paid_recharge_", "").split("_retry_")[0];
    }

    if (!paymentId) {
      return NextResponse.json(
        { error: "No confirmed payment is linked to this recharge. Cannot retry." },
        { status: 400 }
      );
    }

    const payment = await p.payment.findUnique({ where: { id: paymentId } });

    if (!payment) {
      return NextResponse.json({ error: "Associated payment record not found" }, { status: 404 });
    }

    if (payment.status !== "COMPLETED") {
      return NextResponse.json(
        { error: `Payment is not completed (status: ${payment.status}). Cannot retry recharge.` },
        { status: 400 }
      );
    }

    // ── 5. No DONE recharge for the same payment ──────────────────────────────
    const existingDone = await p.rechargeTransaction.findFirst({
      where: {
        idempotencyKey: { startsWith: `paid_recharge_${paymentId}` },
        status: "DONE",
      },
    });

    if (existingDone) {
      return NextResponse.json(
        { error: "A successful recharge already exists for this payment." },
        { status: 400 }
      );
    }

    // ── 6. Attempt cap (< 5 retries for this payment) ─────────────────────────
    const attemptCount = await p.rechargeTransaction.count({
      where: {
        idempotencyKey: { startsWith: `paid_recharge_${paymentId}` },
      },
    });

    if (attemptCount >= 5) {
      return NextResponse.json(
        { error: "Maximum retry attempts (5) reached for this payment. Please contact support." },
        { status: 429 }
      );
    }

    // ── 7. Atomic claim: only proceed if row is still ERROR ───────────────────
    const claimed = await p.rechargeTransaction.updateMany({
      where: { id: rechargeId, status: "ERROR" },
      data: {
        status: "PENDING",
        reason: "customer_retry_dispatched",
        completedAt: null,
      },
    });

    if (claimed.count === 0) {
      // Another concurrent request got here first
      return NextResponse.json(
        { error: "Recharge is already being retried or its status changed. Please refresh." },
        { status: 409 }
      );
    }

    // ── 8. Build retry idempotency key and dispatch to worker ─────────────────
    const retryIdempotency = `paid_recharge_${paymentId}_retry_${attemptCount}`;
    const phone = normalizeIccPhone(tx.number?.number || tx.phone);

    const workerUrl = process.env.WORKER_URL || "http://127.0.0.1:8001";
    const workerSecret =
      process.env.WORKER_SECRET ||
      "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

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

    let workerJobId: string | null = null;
    try {
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
        throw new Error(`Worker error ${workerRes.status}: ${errText}`);
      }

      const workerData = await workerRes.json();
      workerJobId = workerData.rechargeJobId;
    } catch (workerErr: any) {
      // Roll back to ERROR so the customer can try again
      await p.rechargeTransaction.updateMany({
        where: { id: rechargeId, status: "PENDING" },
        data: {
          status: "ERROR",
          reason: "retry_worker_unreachable",
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: "Recharge worker is temporarily unavailable. Please try again shortly." },
        { status: 503 }
      );
    }

    // ── 9. Save new jobId and start server-side finalizer ────────────────────
    await p.rechargeTransaction.update({
      where: { id: rechargeId },
      data: { jobId: workerJobId },
    });

    finalizeRechargeJob(rechargeId, workerJobId!).catch((e) =>
      console.error("[Customer Retry Finalizer Error]", e)
    );

    return NextResponse.json({
      success: true,
      message: "Recharge retry dispatched. Check status in a moment.",
      jobId: workerJobId,
    });
  } catch (error: any) {
    console.error("[Recharge Retry Error]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to retry recharge" },
      { status: 500 }
    );
  }
}
