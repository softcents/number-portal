import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";
import { prisma } from "@/lib/prisma";
import { normalizeIccPhone, finalizeRechargeJob } from "@/lib/rechargeService";

export const dynamic = "force-dynamic";

const WORKER_URL = process.env.WORKER_URL || "http://127.0.0.1:8001";
const WORKER_SECRET =
  process.env.WORKER_SECRET ||
  "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

// GET /api/reseller/recharges
export async function GET(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    const p = prisma as any;

    // Check specific job status
    if (jobId) {
      try {
        const workerRes = await fetch(`${WORKER_URL}/recharge-jobs/${jobId}`, {
          headers: { "x-worker-secret": WORKER_SECRET },
          signal: AbortSignal.timeout(4000),
        });
        if (workerRes.ok) {
          const jobData = await workerRes.json();
          return NextResponse.json({ success: true, job: jobData });
        }
      } catch (err) {
        // Fallback to DB
      }

      const tx = await p.rechargeTransaction.findFirst({
        where: { jobId, resellerId: session.resellerId },
      });
      return NextResponse.json({ success: true, job: tx });
    }

    // List recent recharges for this reseller
    const page = Number(searchParams.get("page") || "1");
    const pageSize = Number(searchParams.get("pageSize") || "50");

    const [total, recharges] = await Promise.all([
      p.rechargeTransaction.count({ where: { resellerId: session.resellerId } }),
      p.rechargeTransaction.findMany({
        where: { resellerId: session.resellerId },
        include: {
          number: { select: { number: true, provider: { select: { name: true, code: true } } } },
          customer: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      success: true,
      total,
      recharges,
      page,
      pageSize,
    });
  } catch (error: any) {
    console.error("[Reseller Recharges GET Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to fetch recharges" }, { status: 500 });
  }
}

// POST /api/reseller/recharges — Execute wholesale discounted recharge
export async function POST(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { phone, amount: rawAmount, idempotencyKey, customerId, numberId } = body;

    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    const amount = Number(rawAmount);
    if (isNaN(amount) || amount < 1 || amount > 10000) {
      return NextResponse.json({ error: "Amount must be between ৳1 and ৳10,000 BDT" }, { status: 400 });
    }

    const p = prisma as any;
    const storedPhone = normalizeIccPhone(cleanPhone);

    // Calculate wholesale discount & net amount
    const discountPercent = Number(session.rechargeDiscountPercent || 0);
    const discountAmount = Number(((amount * discountPercent) / 100).toFixed(2));
    const netAmount = Number(Math.max(0, amount - discountAmount).toFixed(2));

    // Verify balance & debit atomically
    let transactionResult: any = null;
    try {
      transactionResult = await p.$transaction(async (tx: any) => {
        const reseller = await tx.reseller.findUnique({
          where: { id: session.resellerId },
        });

        if (!reseller || reseller.status !== "ACTIVE") {
          throw new Error("Reseller account is not active");
        }

        const currentBalance = Number(reseller.balance || 0);
        if (currentBalance < netAmount) {
          throw new Error(
            `Insufficient reseller balance. Required: ৳${netAmount} BDT (with ${discountPercent}% discount applied), Available: ৳${currentBalance} BDT.`
          );
        }

        const newBalance = Number((currentBalance - netAmount).toFixed(2));

        // Deduct from reseller wallet
        await tx.reseller.update({
          where: { id: reseller.id },
          data: { balance: newBalance },
        });

        // Record ResellerTransaction
        const rTx = await tx.resellerTransaction.create({
          data: {
            resellerId: reseller.id,
            type: "RECHARGE",
            amount,
            discountAmount,
            netAmount,
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            reference: storedPhone,
            notes: `Top up ৳${amount} for ${storedPhone}. Wholesale discount ${discountPercent}% (৳${discountAmount} saved). Net: ৳${netAmount}`,
          },
        });

        // Find associated number if exists
        let numRecord = null;
        if (numberId) {
          numRecord = await tx.number.findUnique({ where: { id: numberId } });
        } else {
          numRecord = await tx.number.findFirst({
            where: {
              OR: [{ number: storedPhone }, { normalizedNumber: storedPhone }],
            },
          });
        }

        // Target customer
        let targetCustId = customerId || numRecord?.customerId;
        if (!targetCustId) {
          // Find or fallback to first reseller customer
          const firstCust = await tx.customer.findFirst({
            where: { resellerId: reseller.id },
          });
          if (firstCust) {
            targetCustId = firstCust.id;
          } else {
            // Auto create a default customer for unassigned reseller recharges
            const newCust = await tx.customer.create({
              data: {
                centralIdentityUserId: `reseller_cust_${reseller.id.slice(0, 6)}_${storedPhone}`,
                fullName: `Subscriber ${storedPhone.slice(-4)}`,
                email: `${storedPhone}@${reseller.username}.reseller`,
                phoneNumber: storedPhone,
                resellerId: reseller.id,
                isActive: true,
                notes: `Auto created during reseller recharge`,
              },
            });
            targetCustId = newCust.id;
          }
        }

        // If number record doesn't exist, create a managed record for this number under reseller
        if (!numRecord) {
          numRecord = await tx.number.create({
            data: {
              number: storedPhone,
              normalizedNumber: storedPhone,
              country: "BD",
              countryCode: "+880",
              numberType: "IP_PHONE",
              status: "ACTIVE",
              customerId: targetCustId,
              resellerId: reseller.id,
              notes: "Created via Reseller Direct Recharge",
            },
          });
        }

        // Create RechargeTransaction
        const rechargeTx = await tx.rechargeTransaction.create({
          data: {
            userId: targetCustId,
            numberId: numRecord.id,
            phone: storedPhone,
            amount,
            status: "PENDING",
            idempotencyKey: idempotencyKey || `reseller_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            resellerId: reseller.id,
            resellerDiscount: discountAmount,
          },
        });

        return {
          rechargeTx,
          resellerTx: rTx,
          numberRecord: numRecord,
          newBalance,
        };
      });
    } catch (txErr: any) {
      return NextResponse.json({ error: txErr?.message || "Transaction error" }, { status: 400 });
    }

    const { rechargeTx, numberRecord, newBalance } = transactionResult;

    // Call Verifier Worker
    let workerJobId: string | null = null;
    try {
      // Find provider credentials
      let prov = null;
      if (numberRecord.providerId) {
        prov = await p.provider.findUnique({
          where: { id: numberRecord.providerId },
          include: { credential: true },
        });
      }

      if (!prov) {
        if (storedPhone.startsWith("09617")) {
          prov = await p.provider.findFirst({
            where: { OR: [{ code: "RANKSITT" }, { code: "RANKS" }] },
            include: { credential: true },
          });
        } else if (storedPhone.startsWith("09644")) {
          prov = await p.provider.findFirst({
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

      const workerRes = await fetch(`${WORKER_URL}/recharge-jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": WORKER_SECRET,
        },
        body: JSON.stringify({
          phone: storedPhone,
          amount,
          idempotencyKey: idempotencyKey || rechargeTx.id,
          provider: providerCode,
          loginUrl: rechargeLoginUrl,
          username: rechargeUsername,
          password: rechargePassword,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!workerRes.ok) {
        const errText = await workerRes.text().catch(() => "");
        throw new Error(`Worker returned HTTP ${workerRes.status}: ${errText}`);
      }

      const workerData = await workerRes.json();
      workerJobId = workerData.rechargeJobId;

      await p.rechargeTransaction.update({
        where: { id: rechargeTx.id },
        data: { jobId: workerJobId },
      });

      if (workerJobId) {
        finalizeRechargeJob(rechargeTx.id, workerJobId).catch((err) =>
          console.error("[Reseller Recharge Finalizer Error]", err)
        );
      }
    } catch (workerErr: any) {
      console.error("[Reseller Recharge Worker Call Failed]", workerErr?.message);

      await p.rechargeTransaction.update({
        where: { id: rechargeTx.id },
        data: {
          status: "UNCERTAIN",
          reason: "worker_unreachable_on_submit",
          completedAt: new Date(),
        },
      });

      return NextResponse.json(
        {
          error: "Recharge status uncertain: service response timed out. Hold retained for admin verification.",
          transactionId: rechargeTx.id,
          status: "uncertain",
        },
        { status: 504 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Recharge job submitted for ${storedPhone}`,
      rechargeJobId: workerJobId,
      transactionId: rechargeTx.id,
      phone: storedPhone,
      amount,
      discountSaved: discountAmount,
      netCharged: netAmount,
      newBalance,
    });
  } catch (error: any) {
    console.error("[Reseller Recharge Error]:", error);
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
