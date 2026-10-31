import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/centralAuth";
import { prisma } from "@/lib/prisma";
import { debitWallet, creditWallet } from "@/lib/walletService";
import {
  finalizeRechargeJob,
  expireStaleRecharges,
  normalizeIccPhone,
  DEBIT_WALLET,
} from "@/lib/rechargeService";

export const dynamic = "force-dynamic";

// ─── Constants (Configurable as requested) ───────────────────────────────────
export const MIN_RECHARGE = 1;
export const MAX_RECHARGE = 5000;
export const DAILY_LIMIT_PER_USER = 10000;
export { DEBIT_WALLET };

// In-memory rate limiting (5 second cooldown per user)
const lastRequestByUser: Map<string, number> = new Map();

/**
 * POST /api/recharge
 * Authenticated endpoint: validates ownership of active number, applies limits,
 * optionally debits wallet, creates transaction record, and invokes verifier worker.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getClientSession(req);
    if (!session || !session.customerId) {
      return NextResponse.json({ error: "Unauthorized: Please log in" }, { status: 401 });
    }

    const userId = session.customerId;

    // Rate limit per user: 5 second cooldown
    const now = Date.now();
    const lastReq = lastRequestByUser.get(userId) || 0;
    if (now - lastReq < 5000) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a few seconds before trying again." },
        { status: 429 }
      );
    }
    lastRequestByUser.set(userId, now);

    const body = await req.json();
    const { phone, numberId, amount: rawAmount, idempotencyKey } = body;

    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    const amount = Number(rawAmount);
    if (isNaN(amount) || amount < MIN_RECHARGE || amount > MAX_RECHARGE) {
      return NextResponse.json(
        { error: `Amount must be between ৳${MIN_RECHARGE} and ৳${MAX_RECHARGE} BDT` },
        { status: 400 }
      );
    }

    // Decimal precision validation (max 2 decimals)
    if (Math.round(amount * 100) !== amount * 100) {
      return NextResponse.json(
        { error: "Amount can have at most 2 decimal places" },
        { status: 400 }
      );
    }

    const p = prisma as any;

    // 1. OWNERSHIP CHECK: Ensure number belongs to this customer and is ACTIVE
    const numberWhere: any = {
      customerId: userId,
      status: "ACTIVE",
    };
    if (numberId) {
      numberWhere.id = numberId;
    } else {
      numberWhere.OR = [
        { number: cleanPhone },
        { normalizedNumber: cleanPhone },
      ];
    }

    const numberRecord = await p.number.findFirst({
      where: numberWhere,
      include: { wallet: true, provider: { include: { credential: true } } },
    });

    if (!numberRecord) {
      return NextResponse.json(
        { error: "Access denied: Number not found or is not active in your account" },
        { status: 403 }
      );
    }

    // 2. DAILY LIMIT CHECK (10,000 BDT per user per day)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayAgg = await p.rechargeTransaction.aggregate({
      where: {
        userId,
        createdAt: { gte: startOfDay },
        status: { in: ["PENDING", "DONE", "UNCERTAIN"] },
      },
      _sum: { amount: true },
    });

    const totalToday = Number(todayAgg._sum.amount || 0);
    if (totalToday + amount > DAILY_LIMIT_PER_USER) {
      return NextResponse.json(
        {
          error: `Daily limit of ৳${DAILY_LIMIT_PER_USER} BDT exceeded. You have already recharged ৳${totalToday} today.`,
        },
        { status: 400 }
      );
    }

    // Check repeated idempotencyKey in DB
    if (idempotencyKey) {
      const existingTx = await p.rechargeTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existingTx) {
        return NextResponse.json({
          success: true,
          rechargeJobId: existingTx.jobId,
          transactionId: existingTx.id,
          status: existingTx.status,
          message: "Existing transaction returned",
        });
      }
    }

    // 3. OPTIONAL WALLET DEBIT (when DEBIT_WALLET is True)
    let debitedWalletId: string | null = null;
    if (DEBIT_WALLET) {
      if (!numberRecord.wallet?.id) {
        return NextResponse.json({ error: "Wallet not found for this number" }, { status: 400 });
      }
      const walletId: string = numberRecord.wallet.id;
      debitedWalletId = walletId;
      const debitRes = await debitWallet({
        walletId,
        amount,
        reference: idempotencyKey || undefined,
        notes: `ICC Top Up hold for ${cleanPhone}`,
        actorId: userId,
      });

      if (!debitRes.success) {
        return NextResponse.json(
          { error: debitRes.error || "Insufficient wallet balance" },
          { status: 400 }
        );
      }
    }

    const storedPhone = normalizeIccPhone(numberRecord.number || numberRecord.normalizedNumber);

    // 4. PERSIST TRANSACTION in recharge_transactions table
    const tx = await p.rechargeTransaction.create({
      data: {
        userId,
        numberId: numberRecord.id,
        phone: storedPhone,
        amount,
        status: "PENDING",
        idempotencyKey: idempotencyKey || null,
      },
    });

    // 5. CALL PYTHON VERIFIER WORKER
    const workerUrl = process.env.WORKER_URL || "http://127.0.0.1:8001";
    const workerSecret =
      process.env.WORKER_SECRET ||
      "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

    let workerJobId: string | null = null;
    try {
      let prov = numberRecord.provider;
      if (!prov) {
        if (storedPhone.startsWith("09617")) {
          prov = await p.provider.findUnique({
            where: { code: "RANKSITT" },
            include: { credential: true },
          });
        } else if (storedPhone.startsWith("09644")) {
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

      const providerCode = prov?.code || (storedPhone.startsWith("09617") ? "RANKSITT" : storedPhone.startsWith("09644") ? "ICON" : "ICC");
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
          phone: storedPhone,
          amount,
          idempotencyKey: idempotencyKey || tx.id,
          provider: providerCode,
          loginUrl: rechargeLoginUrl,
          username: rechargeUsername,
          password: rechargePassword,
        }),
        signal: AbortSignal.timeout(8000), // 8s timeout per requirement
      });

      if (!workerRes.ok) {
        const errText = await workerRes.text().catch(() => "");
        throw new Error(`Worker returned HTTP ${workerRes.status}: ${errText}`);
      }

      const workerData = await workerRes.json();
      workerJobId = workerData.rechargeJobId;

      await p.rechargeTransaction.update({
        where: { id: tx.id },
        data: { jobId: workerJobId },
      });

      // ── SERVER-SIDE FINALIZER ──────────────────────────────────────────────
      // Start background polling task immediately on server.
      // Guarantees that the row is finalized and wallet balance updated
      // even if the user closes modal or browser tab immediately after confirmation.
      if (workerJobId) {
        finalizeRechargeJob(tx.id, workerJobId).catch((err) =>
          console.error("[Recharge Finalizer Background Error]", err)
        );
      }
    } catch (workerErr: any) {
      console.error("[Recharge Worker Call Failed]", workerErr?.message);

      // CRITICAL (Requirement 2):
      // If the worker is unreachable or times out, the recharge POST may have been sent across the wire!
      // Must mark the transaction "UNCERTAIN" and keep any wallet hold.
      // Must NEVER mark it "ERROR" and NEVER auto-refund!
      await p.rechargeTransaction.update({
        where: { id: tx.id },
        data: {
          status: "UNCERTAIN",
          reason: "worker_unreachable_on_submit",
          completedAt: new Date(),
        },
      });

      return NextResponse.json(
        {
          error: "Recharge status uncertain: service response timed out or worker unreachable. A hold has been retained for admin review.",
          transactionId: tx.id,
          status: "uncertain",
        },
        { status: 504 }
      );
    }

    return NextResponse.json({
      success: true,
      rechargeJobId: workerJobId,
      transactionId: tx.id,
      phone: cleanPhone,
      amount,
    });
  } catch (err: any) {
    console.error("[Recharge API Error]", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/recharge?jobId=... or ?numberId=... or ?phone=...
 * Proxies worker job status and finalizes the transaction, OR returns recent 10 recharges.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getClientSession(req);
    if (!session || !session.customerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    const numberId = searchParams.get("numberId");
    const phone = searchParams.get("phone");

    const p = prisma as any;

    // ── Mode 1: Poll Job Status (Strictly Read-Only) ─────────────────────────
    if (jobId) {
      // Opportunistically sweep any stale pending jobs (> 5 minutes) in background
      expireStaleRecharges().catch(() => {});

      // 1. Fetch transaction record from database
      const dbTx = await p.rechargeTransaction.findFirst({
        where: { jobId, userId: session.customerId },
      });

      if (!dbTx) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      // 2. If transaction reached final state (DONE, UNCERTAIN, or ERROR),
      // return it directly from DB (strictly read-only)
      if (dbTx.status !== "PENDING") {
        return NextResponse.json({
          status: dbTx.status.toLowerCase(),
          stage: dbTx.status.toLowerCase(),
          reason: dbTx.reason,
          balanceBefore: dbTx.balanceBefore ? Number(dbTx.balanceBefore) : undefined,
          balanceAfter: dbTx.balanceAfter ? Number(dbTx.balanceAfter) : undefined,
          amount: Number(dbTx.amount),
          durationMs: dbTx.durationMs,
          reference: dbTx.reference,
        });
      }

      // 3. If transaction is still PENDING after 5 minutes, return uncertain for admin review
      const ageMs = Date.now() - new Date(dbTx.createdAt).getTime();
      if (ageMs > 5 * 60 * 1000) {
        return NextResponse.json({
          status: "uncertain",
          stage: "uncertain",
          reason: "stale_pending_timeout",
          amount: Number(dbTx.amount),
        });
      }

      // 4. For active PENDING jobs, query worker read-only for live progress
      const workerUrl = process.env.WORKER_URL || "http://127.0.0.1:8001";
      const workerSecret =
        process.env.WORKER_SECRET ||
        "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

      try {
        const workerRes = await fetch(`${workerUrl}/recharge-jobs/${jobId}`, {
          headers: { "x-worker-secret": workerSecret },
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        });

        if (workerRes.status === 404) {
          // Worker restarted or lost in-memory state!
          // Server-side finalizer marks UNCERTAIN in DB; return uncertain read-only
          return NextResponse.json({
            status: "uncertain",
            stage: "uncertain",
            reason: "worker_restarted_or_lost",
            amount: Number(dbTx.amount),
          });
        }

        if (!workerRes.ok) {
          return NextResponse.json({
            status: "pending",
            stage: "verify",
            amount: Number(dbTx.amount),
          });
        }

        const jobData = await workerRes.json();
        // Return read-only live progress to browser without mutating DB or wallet
        return NextResponse.json(jobData);
      } catch {
        return NextResponse.json({
          status: "pending",
          stage: "verify",
          amount: Number(dbTx.amount),
        });
      }
    }

    // ── Mode 2: Expose Recent Recharges List (Last 10) ────────────────────────
    if (numberId || phone) {
      const cleanPhone = phone ? phone.replace(/\D/g, "") : undefined;
      const recentList = await p.rechargeTransaction.findMany({
        where: {
          userId: session.customerId,
          ...(numberId ? { numberId } : {}),
          ...(cleanPhone ? { phone: cleanPhone } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          phone: true,
          amount: true,
          status: true,
          reason: true,
          balanceBefore: true,
          balanceAfter: true,
          reference: true,
          durationMs: true,
          createdAt: true,
          completedAt: true,
        },
      });

      return NextResponse.json({
        recentRecharges: recentList.map((r: any) => ({
          id: r.id,
          phone: r.phone,
          amount: Number(r.amount),
          status: r.status,
          reason: r.reason,
          balanceBefore: r.balanceBefore ? Number(r.balanceBefore) : null,
          balanceAfter: r.balanceAfter ? Number(r.balanceAfter) : null,
          reference: r.reference,
          durationMs: r.durationMs,
          createdAt: r.createdAt,
          completedAt: r.completedAt,
        })),
      });
    }

    return NextResponse.json({ error: "Missing jobId, numberId, or phone parameter" }, { status: 400 });
  } catch (err: any) {
    console.error("[Recharge GET Error]", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
