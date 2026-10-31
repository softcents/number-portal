/**
 * Recharge Service — Server-Side Finalizer & Lost Job Handler
 *
 * Guarantees that:
 * 1. Even if the user closes the modal or browser tab, a server-side background task
 *    polls the worker until a final state, writes the transaction row, and updates wallets.
 * 2. If the worker returns 404 (worker restarted) or is unreachable after the recharge POST
 *    may have been sent, the transaction is marked "UNCERTAIN" and any wallet hold is kept.
 *    It is NEVER marked "ERROR" and NEVER auto-refunded.
 * 3. Any transaction still PENDING after 5 minutes is marked "UNCERTAIN" for admin review.
 * 4. Browser polling remains strictly read-only.
 */

import { prisma } from "@/lib/prisma";
import { creditWallet } from "@/lib/walletService";

export const DEBIT_WALLET = false; // When false: user's wallet is not charged. When true: debits user's wallet atomically.

/**
 * Shared normalizeIccPhone function:
 * digits only;
 * if it starts with "880" and the rest is 10 digits, replace "880" with "0";
 * if it is 10 digits starting with "9" and not "0", prefix "0".
 * Result matches the Number's stored number format (e.g. 09639900643).
 */
export function normalizeIccPhone(phone: string): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("880") && digits.length === 13) {
    digits = "0" + digits.slice(3);
  } else if (digits.length === 10 && digits.startsWith("9")) {
    digits = "0" + digits;
  }
  return digits;
}

const WORKER_URL = process.env.WORKER_URL || "http://127.0.0.1:8001";
const WORKER_SECRET =
  process.env.WORKER_SECRET ||
  "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

/**
 * Sweep any transactions still PENDING after 5 minutes and mark them UNCERTAIN.
 * Keeps any wallet hold for admin review.
 */
export async function expireStaleRecharges(): Promise<number> {
  const p = prisma as any;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  try {
    const staleList = await p.rechargeTransaction.findMany({
      where: {
        status: "PENDING",
        createdAt: { lte: fiveMinutesAgo },
      },
      select: { id: true, phone: true, jobId: true },
    });

    if (!staleList || staleList.length === 0) return 0;

    const ids = staleList.map((r: any) => r.id);
    await p.rechargeTransaction.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "UNCERTAIN",
        reason: "stale_pending_timeout",
        completedAt: new Date(),
      },
    });

    console.warn(
      `[Recharge Finalizer] Marked ${ids.length} stale pending transaction(s) as UNCERTAIN for admin review.`
    );
    return ids.length;
  } catch (err: any) {
    console.error("[Recharge Finalizer] Error sweeping stale recharges:", err?.message);
    return 0;
  }
}

/**
 * Server-side background finalizer.
 * Polls the worker until a final state is reached, then writes the database row and applies wallet logic.
 */
export async function finalizeRechargeJob(transactionId: string, jobId: string): Promise<void> {
  const p = prisma as any;

  const maxDurationMs = 90_000; // 90 seconds maximum polling window
  const pollIntervalMs = 600;   // 600ms between polls
  const startTime = Date.now();

  let seenRechargeOrVerifyStage = false;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 6; // ~3.6s of sustained worker connection failure

  while (Date.now() - startTime < maxDurationMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    // 1. Check if transaction was already completed or cancelled elsewhere
    const tx = await p.rechargeTransaction.findUnique({
      where: { id: transactionId },
      include: { number: { include: { wallet: true } } },
    });

    if (!tx || tx.status !== "PENDING") {
      // Already completed by another execution
      return;
    }

    // 2. Poll worker endpoint
    let res: Response;
    try {
      res = await fetch(`${WORKER_URL}/recharge-jobs/${jobId}`, {
        headers: { "x-worker-secret": WORKER_SECRET },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      consecutiveErrors = 0;
    } catch (networkErr: any) {
      consecutiveErrors++;
      console.warn(
        `[Recharge Finalizer] Worker network error (${consecutiveErrors}/${maxConsecutiveErrors}): ${networkErr?.message}`
      );

      // If worker becomes sustainedly unreachable after job creation or after recharge stage:
      // The recharge POST may have been sent! Mark UNCERTAIN and KEEP wallet hold.
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error(
          `[Recharge Finalizer] Worker unreachable for job ${jobId}. Marking transaction ${transactionId} as UNCERTAIN.`
        );
        await p.rechargeTransaction.update({
          where: { id: transactionId },
          data: {
            status: "UNCERTAIN",
            reason: seenRechargeOrVerifyStage ? "worker_unreachable_after_recharge" : "worker_unreachable",
            completedAt: new Date(),
          },
        });
        return;
      }
      continue;
    }

    // 3. Worker returned HTTP 404 (Worker crashed / restarted and lost in-memory state)
    if (res.status === 404) {
      console.error(
        `[Recharge Finalizer] Worker returned 404 for job ${jobId} (worker may have restarted). Marking transaction ${transactionId} as UNCERTAIN to prevent double charge.`
      );
      await p.rechargeTransaction.update({
        where: { id: transactionId },
        data: {
          status: "UNCERTAIN",
          reason: "worker_restarted_or_lost",
          completedAt: new Date(),
        },
      });
      // CRITICAL: KEEP wallet hold. Never mark ERROR or auto-refund when state is lost.
      return;
    }

    if (!res.ok) {
      consecutiveErrors++;
      if (consecutiveErrors >= maxConsecutiveErrors) {
        await p.rechargeTransaction.update({
          where: { id: transactionId },
          data: {
            status: "UNCERTAIN",
            reason: `worker_http_${res.status}`,
            completedAt: new Date(),
          },
        });
        return;
      }
      continue;
    }

    // 4. Parse worker response
    let jobData: any;
    try {
      jobData = await res.json();
    } catch {
      continue;
    }

    const workerStatus = jobData.status?.toLowerCase();
    const workerStage = jobData.stage?.toLowerCase();

    if (workerStage === "recharge" || workerStage === "verify") {
      seenRechargeOrVerifyStage = true;
    }

    // Still pending: check for 5 minute staleness guard
    if (workerStatus === "pending") {
      if (Date.now() - new Date(tx.createdAt).getTime() > 5 * 60 * 1000) {
        await p.rechargeTransaction.update({
          where: { id: transactionId },
          data: {
            status: "UNCERTAIN",
            reason: "stale_pending_timeout",
            completedAt: new Date(),
          },
        });
        return;
      }
      continue;
    }

    // 5. Final State: DONE
    if (workerStatus === "done") {
      await p.rechargeTransaction.update({
        where: { id: transactionId },
        data: {
          status: "DONE",
          balanceBefore: jobData.balanceBefore ?? null,
          balanceAfter: jobData.balanceAfter ?? null,
          durationMs: jobData.durationMs || null,
          reference: jobData.reference || null,
          completedAt: new Date(),
        },
      });

      // Update related RechargeOrder to DONE if exists
      if (tx.idempotencyKey?.startsWith("paid_recharge_")) {
        const paymentId = tx.idempotencyKey.replace("paid_recharge_", "").split("_retry_")[0];
        const payment = await p.payment.findUnique({ where: { id: paymentId } });
        if (payment?.rechargeOrderId) {
          await p.rechargeOrder
            .update({
              where: { id: payment.rechargeOrderId },
              data: { status: "DONE" },
            })
            .catch(() => {});
        }
      }

      // Update number's wallet balance from balanceAfter immediately
      if (jobData.balanceAfter !== undefined && tx.numberId) {
        await p.numberWallet
          .upsert({
            where: { numberId: tx.numberId },
            update: { balance: jobData.balanceAfter },
            create: { numberId: tx.numberId, balance: jobData.balanceAfter },
          })
          .catch((e: any) => console.warn("[Recharge Finalizer Wallet Sync Warning]", e));
      }
      return;
    }

    // 6. Final State: UNCERTAIN
    if (workerStatus === "uncertain") {
      const reason = jobData.reason || "unconfirmed";
      await p.rechargeTransaction.update({
        where: { id: transactionId },
        data: {
          status: "UNCERTAIN",
          reason,
          balanceBefore: jobData.balanceBefore ?? null,
          balanceAfter: jobData.balanceAfter ?? null,
          durationMs: jobData.durationMs || null,
          reference: jobData.reference || null,
          completedAt: new Date(),
        },
      });

      // Mark order paid_recharge_failed with the reason for admin review
      if (tx.idempotencyKey?.startsWith("paid_recharge_")) {
        const paymentId = tx.idempotencyKey.replace("paid_recharge_", "").split("_retry_")[0];
        const payment = await p.payment.findUnique({ where: { id: paymentId } });
        if (payment?.rechargeOrderId) {
          await p.rechargeOrder
            .update({
              where: { id: payment.rechargeOrderId },
              data: {
                status: "paid_recharge_failed",
                failureReason: reason,
              },
            })
            .catch(() => {});
        }
      }

      // Wallet hold is KEPT for admin review; no refund.
      return;
    }

    // 7. Final State: ERROR
    if (workerStatus === "error") {
      const failReason = jobData.reason || "unknown_error";
      await p.rechargeTransaction.update({
        where: { id: transactionId },
        data: {
          status: "ERROR",
          reason: failReason,
          durationMs: jobData.durationMs || null,
          completedAt: new Date(),
        },
      });

      // Requirement 4: When the worker returns an error after a confirmed payment,
      // mark the order "paid_recharge_failed" with the reason
      if (tx.idempotencyKey?.startsWith("paid_recharge_")) {
        const paymentId = tx.idempotencyKey.replace("paid_recharge_", "").split("_retry_")[0];
        const payment = await p.payment.findUnique({ where: { id: paymentId } });
        if (payment?.rechargeOrderId) {
          await p.rechargeOrder
            .update({
              where: { id: payment.rechargeOrderId },
              data: {
                status: "paid_recharge_failed",
                failureReason: failReason,
              },
            })
            .catch(() => {});
        }
      }

      // If DEBIT_WALLET was true, auto-refund on verified error
      if (DEBIT_WALLET && tx.number?.wallet?.id) {
        await creditWallet({
          walletId: tx.number.wallet.id,
          amount: Number(tx.amount),
          transactionType: "REFUND",
          reference: tx.id,
          notes: `Auto-refund: Recharge failed (${failReason})`,
          actorId: "system",
        }).catch((e: any) => console.error("[Recharge Finalizer Auto-refund Failed]", e));
      }
      return;
    }
  }

  // 8. If polling window (90s) timed out without a definitive resolution:
  // Transaction remains PENDING until the 5-minute stale sweeper or admin marks it.
  const finalCheck = await p.rechargeTransaction.findUnique({ where: { id: transactionId } });
  if (finalCheck && finalCheck.status === "PENDING") {
    // If we passed the recharge stage or if the time has reached 5 minutes, mark UNCERTAIN
    if (seenRechargeOrVerifyStage || Date.now() - new Date(finalCheck.createdAt).getTime() > 5 * 60 * 1000) {
      await p.rechargeTransaction.update({
        where: { id: transactionId },
        data: {
          status: "UNCERTAIN",
          reason: seenRechargeOrVerifyStage ? "unconfirmed_after_recharge_stage" : "stale_pending_timeout",
          completedAt: new Date(),
        },
      });
    }
  }
}

// ── Background Sweeper for Stale Pending Recharges ────────────────────────────
// Runs every 60 seconds. Guarantees any transaction still pending after 5 minutes
// is marked "UNCERTAIN" for admin review even if no client or poller is active.
if (typeof setInterval !== "undefined") {
  const sweeper = setInterval(() => {
    expireStaleRecharges().catch((err) => {
      console.error("[Recharge Sweeper Error]", err?.message);
    });
  }, 60_000);
  if (typeof (sweeper as any)?.unref === "function") {
    (sweeper as any).unref();
  }
}

