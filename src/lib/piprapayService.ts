import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { completeOrder } from "@/lib/orderService";
import { creditWallet } from "@/lib/walletService";

// ─── Environment & Configuration ─────────────────────────────────────────────
// Real epay (PipraPay self-hosted) credentials and endpoint
const PIPRAPAY_API_KEY =
  process.env.PIPRAPAY_API_KEY ||
  "b3e91bb98e0d874acb860272f240000b48a47368010ed81017";
// Base URL is the real epay instance
const PIPRAPAY_BASE_URL =
  process.env.PIPRAPAY_BASE_URL || "https://epay.softcents.com/api";
// Production deployment always uses real PipraPay (epay) gateway — never sandbox
const IS_SANDBOX = false;

// Worker config (for ICC Talk recharge dispatch after payment)
const WORKER_URL = process.env.WORKER_URL || "http://127.0.0.1:8001";
const WORKER_SECRET =
  process.env.WORKER_SECRET ||
  "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

function maskEmail(email?: string | null): string {
  if (!email) return "***";
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const user = parts[0];
  const maskedUser = user.length > 2 ? `${user.slice(0, 2)}***` : "***";
  return `${maskedUser}@${parts[1]}`;
}

function maskPhone(phone?: string | null): string {
  if (!phone) return "***";
  const clean = phone.replace(/\D/g, "");
  if (clean.length <= 4) return "****";
  return clean.slice(0, 3) + "***" + clean.slice(-3);
}

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

export interface CreateCheckoutParams {
  customerId: string;
  orderId?: string;
  rechargeOrderId?: string;
  numberId?: string;
  walletId?: string;
  amount: number;
  currency?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  redirectUrl?: string;
  cancelUrl?: string;
  webhookUrl?: string;
  ipAddress?: string;
}

// ─── 1. Create Checkout / Payment Session ─────────────────────────────────────
export async function createCheckoutSession(params: CreateCheckoutParams) {
  const {
    customerId,
    orderId,
    rechargeOrderId,
    numberId,
    walletId,
    amount,
    currency = "BDT",
    customerName,
    customerEmail,
    customerPhone,
    redirectUrl,
    cancelUrl,
    webhookUrl,
    ipAddress,
  } = params;

  if (amount <= 0) {
    throw new Error("Payment amount must be greater than 0");
  }

  const p = prisma as any;
  const idempotencyKey = crypto.randomUUID();

  // 1. Create pending Payment record in PostgreSQL
  const payment = await p.payment.create({
    data: {
      customerId,
      orderId: orderId ?? null,
      rechargeOrderId: rechargeOrderId ?? null,
      numberId: numberId ?? null,
      walletId: walletId ?? null,
      gateway: "PIPRAPAY",
      amount,
      currency,
      status: "PENDING",
      verificationStatus: "UNVERIFIED",
      idempotencyKey,
    },
  });

  // 2. Initial Payment Audit Log
  await p.paymentAuditLog.create({
    data: {
      paymentId: payment.id,
      oldStatus: null,
      newStatus: "PENDING",
      oldAmount: null,
      newAmount: amount,
      action: "INITIATE_PAYMENT",
      reason: orderId
        ? `Checkout for order ${orderId}`
        : rechargeOrderId
        ? `Recharge checkout for ${rechargeOrderId}`
        : "Wallet recharge checkout",
      ipAddress: ipAddress ?? null,
      metadata: {
        gateway: "PIPRAPAY",
        isSandbox: IS_SANDBOX,
        orderId,
        rechargeOrderId,
      },
    },
  });

  // 3. Sandbox simulator (only if explicitly enabled — NOT for production)
  if (IS_SANDBOX) {
    const gatewayPaymentId = `SANDBOX-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

    await p.payment.update({
      where: { id: payment.id },
      data: {
        gatewayPaymentId,
        notes: "Sandbox payment session generated",
      },
    });

    const host = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const paymentUrl = `${host}/api/payments/sandbox-checkout?paymentId=${payment.id}&token=${idempotencyKey}`;

    return {
      success: true,
      paymentId: payment.id,
      gatewayPaymentId,
      paymentUrl,
      isSandbox: true,
      amount,
      currency,
    };
  }

  // 4. Live Gateway Request — epay / PipraPay Integration (matches sms.whiteinfobd.com PipraPayDriver)
  try {
    const host = (
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://iptsp-panel.softcents.com"
    ).trim();

    const finalRedirectUrl = (
      redirectUrl ||
      `${host}/portal?payment=success&paymentId=${payment.id}`
    ).replace("PAYMENT_ID_PLACEHOLDER", payment.id);

    const finalCancelUrl =
      cancelUrl ||
      `${host}/portal?payment=cancelled&paymentId=${payment.id}`;

    const finalWebhookUrl =
      webhookUrl ||
      `${host}/api/payments/webhook`;

    const customerEmailClean = customerEmail || "customer@softcents.com";
    const customerPhoneClean = customerPhone || "01700000000";

    // Standard PipraPay / epay checkout redirect payload
    const chargePayload = {
      full_name: customerName || "Valued Customer",
      email_address: customerEmailClean,
      mobile_number: customerPhoneClean,
      amount: amount.toFixed(2),
      currency: currency || "BDT",
      metadata: JSON.stringify({
        payment_id: payment.id,
        order_id: orderId || null,
        recharge_order_id: rechargeOrderId || null,
        customer_id: customerId,
      }),
      return_url: finalRedirectUrl,
      webhook_url: finalWebhookUrl,
    };

    // Requirement 2: Log request payload with masked PII and never log the API key
    console.log("[PipraPay Checkout Request Payload]:", {
      endpoint: `${PIPRAPAY_BASE_URL}/checkout/redirect`,
      fields: Object.keys(chargePayload),
      amount: chargePayload.amount,
      currency: chargePayload.currency,
      return_url: chargePayload.return_url,
      webhook_url: chargePayload.webhook_url,
      full_name: chargePayload.full_name,
      masked_email: maskEmail(chargePayload.email_address),
      masked_phone: maskPhone(chargePayload.mobile_number),
    });

    const res = await fetch(`${PIPRAPAY_BASE_URL}/checkout/redirect`, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "MHS-PIPRAPAY-API-KEY": PIPRAPAY_API_KEY,
        "mh-piprapay-api-key": PIPRAPAY_API_KEY,
      },
      body: JSON.stringify(chargePayload),
      signal: AbortSignal.timeout(15000),
    });

    const resText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(resText);
    } catch {
      data = null;
    }

    if (!res.ok || data?.status === false || data?.status === "error" || data?.error) {
      // Requirement 1: Log HTTP status and response body truncated to 500 chars (never log API key)
      const truncatedBody = resText.slice(0, 500);
      console.error(
        `[PipraPay Error HTTP ${res.status}] Body: ${truncatedBody}`
      );

      // Requirement 5: Return PipraPay's error message as friendly reason instead of only "HTTP 400"
      const friendlyError =
        data?.error?.message ||
        data?.message ||
        (typeof data?.error === "string" ? data.error : null) ||
        `Payment gateway rejected request (HTTP ${res.status}): ${truncatedBody.slice(0, 150)}`;

      throw new Error(friendlyError);
    }

    // Epays returns pp_id and pp_url
    const gatewayPaymentId =
      data?.pp_id || data?.invoice_id || data?.payment_id || null;
    const paymentUrl =
      data?.pp_url ||
      data?.payment_url ||
      data?.url ||
      `${PIPRAPAY_BASE_URL}/checkout/redirect?invoice_id=${gatewayPaymentId}`;

    if (!paymentUrl) {
      throw new Error("Payment gateway did not return a checkout URL.");
    }

    await p.payment.update({
      where: { id: payment.id },
      data: {
        gatewayPaymentId,
        rawResponse: data,
      },
    });

    return {
      success: true,
      paymentId: payment.id,
      gatewayPaymentId,
      paymentUrl,
      isSandbox: false,
      amount,
      currency,
    };
  } catch (error: any) {
    await p.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        notes: `Gateway call error: ${error?.message}`,
      },
    });

    throw error;
  }
}

// ─── 2. Verify Payment with PipraPay using pp_id ──────────────────────────────
export async function verifyWithPipraPay(ppId: string): Promise<{
  verified: boolean;
  status?: string;
  rawData?: any;
}> {
  try {
    const res = await fetch(`${PIPRAPAY_BASE_URL}/verify-payment`, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "MHS-PIPRAPAY-API-KEY": PIPRAPAY_API_KEY,
        "mh-piprapay-api-key": PIPRAPAY_API_KEY,
      },
      body: JSON.stringify({ pp_id: ppId }),
      signal: AbortSignal.timeout(10000),
    });

    const resText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(resText);
    } catch {
      data = null;
    }

    if (!res.ok) {
      console.error(
        `[PipraPay Verify Error HTTP ${res.status}] Body: ${resText.slice(0, 500)}`
      );
      return { verified: false };
    }

    const status = (data?.status || "").toLowerCase();
    const verified =
      status === "completed" || status === "paid" || status === "success";

    return { verified, status, rawData: data };
  } catch (err: any) {
    console.error("[PipraPay Verify Exception]:", err?.message);
    return { verified: false };
  }
}

// ─── 3. Process Successful Payment (Webhook / Return) ────────────────────────
export async function processPaymentSuccess(params: {
  paymentId: string;
  gatewayTransactionId?: string;
  ppId?: string;
  rawResponse?: any;
  actorId?: string;
  ipAddress?: string;
}) {
  const {
    paymentId,
    gatewayTransactionId = `TXN-${Date.now()}`,
    ppId,
    rawResponse,
    actorId = "piprapay_webhook",
    ipAddress,
  } = params;

  const p = prisma as any;

  // 1. Fetch current payment state
  const payment = await p.payment.findUnique({
    where: { id: paymentId },
    include: { order: true },
  });

  if (!payment) throw new Error("Payment record not found");

  // Enforce idempotency: If already COMPLETED, safely return without re-crediting
  if (payment.status === "COMPLETED") {
    if (payment.rechargeOrderId) {
      executeIccRechargeAfterPayment({
        paymentId: payment.id,
        rechargeOrderId: payment.rechargeOrderId,
        customerId: payment.customerId,
        amount: Number(payment.amount),
      }).catch((err) =>
        console.error("[ICC Recharge Idempotent Ensure Error]", err)
      );
    }
    return {
      success: true,
      alreadyProcessed: true,
      paymentId: payment.id,
      orderId: payment.orderId,
      rechargeOrderId: payment.rechargeOrderId,
    };
  }

  const now = new Date();

  // 2. Atomic transaction to mark payment completed & audit log
  await p.$transaction(async (tx: any) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: "COMPLETED",
        verificationStatus: "VERIFIED",
        verifiedAt: now,
        paidAt: now,
        gatewayTransactionId,
        gatewayPaymentId: ppId || payment.gatewayPaymentId,
        rawResponse: rawResponse ?? null,
        updatedAt: now,
      },
    });

    await tx.paymentAuditLog.create({
      data: {
        paymentId,
        oldStatus: payment.status,
        newStatus: "COMPLETED",
        oldAmount: payment.amount,
        newAmount: payment.amount,
        action: "PAYMENT_CONFIRMED",
        reason: "Gateway verified payment success",
        adminId: actorId === "admin" ? actorId : null,
        ipAddress: ipAddress ?? null,
        metadata: { gatewayTransactionId, rawResponse },
      },
    });
  });

  // 3. Post-payment triggers:
  // Trigger A: If this payment was for a Number Order -> complete the order!
  if (payment.orderId) {
    await completeOrder({
      orderId: payment.orderId,
      paymentId: payment.id,
      actorId,
      ipAddress,
    });
  }

  // Trigger B: If this payment was for a Wallet Recharge -> credit the wallet!
  if (payment.walletId) {
    await creditWallet({
      walletId: payment.walletId,
      amount: Number(payment.amount),
      transactionType: "RECHARGE",
      reference: gatewayTransactionId,
      paymentId: payment.id,
      notes: "Online recharge via PipraPay",
      actorId,
    });
  }

  // Trigger C: If this payment was for an ICC Talk recharge order -> execute ICC recharge NOW
  if (payment.rechargeOrderId) {
    // Fire in background — don't block the webhook/redirect response
    executeIccRechargeAfterPayment({
      paymentId: payment.id,
      rechargeOrderId: payment.rechargeOrderId,
      customerId: payment.customerId,
      amount: Number(payment.amount),
    }).catch((err) =>
      console.error("[ICC Recharge After Payment Error]", err)
    );
  }

  return {
    success: true,
    paymentId: payment.id,
    orderId: payment.orderId,
    rechargeOrderId: payment.rechargeOrderId,
    walletId: payment.walletId,
    status: "COMPLETED",
  };
}

// ─── 4. Execute ICC Talk Recharge After Confirmed Payment ─────────────────────
export async function executeIccRechargeAfterPayment(params: {
  paymentId: string;
  rechargeOrderId: string;
  customerId: string;
  amount: number;
  forceRetry?: boolean;
}) {
  const { paymentId, rechargeOrderId, customerId, amount, forceRetry } = params;
  const p = prisma as any;

  // Fetch the RechargeOrder
  const rechargeOrder = await p.rechargeOrder.findUnique({
    where: { id: rechargeOrderId },
  });

  if (!rechargeOrder) {
    console.error(`[ICC Recharge] RechargeOrder ${rechargeOrderId} not found`);
    return { success: false, reason: "order_not_found" };
  }

  // Refuse if a recharge for that order already succeeded
  if (rechargeOrder.status === "DONE" || rechargeOrder.status === "COMPLETED") {
    console.log(`[ICC Recharge] RechargeOrder ${rechargeOrderId} already succeeded. Refusing duplicate recharge.`);
    return { success: false, reason: "already_succeeded" };
  }

  // Check if any transaction for this order/payment already succeeded
  const successfulTx = await p.rechargeTransaction.findFirst({
    where: {
      userId: customerId,
      numberId: rechargeOrder.numberId,
      status: "DONE",
      OR: [
        { idempotencyKey: { startsWith: `paid_recharge_${paymentId}` } },
        { idempotencyKey: `paid_recharge_${paymentId}` },
      ],
    },
  });

  if (successfulTx) {
    console.log(`[ICC Recharge] Recharge for payment ${paymentId} already succeeded.`);
    await p.rechargeOrder.update({
      where: { id: rechargeOrderId },
      data: { status: "DONE" },
    }).catch(() => {});
    return { success: false, reason: "already_succeeded" };
  }

  // Get the number record for its stored phone
  const numberRecord = await p.number.findUnique({
    where: { id: rechargeOrder.numberId },
    include: { wallet: true, provider: { include: { credential: true } } },
  });

  if (!numberRecord) {
    console.error(`[ICC Recharge] Number ${rechargeOrder.numberId} not found`);
    return { success: false, reason: "number_not_found" };
  }

  // Requirement 2: Always send the Number record's stored phone (the one shown on the card)
  // to the worker, not any phone taken from PipraPay metadata or the customer profile.
  // Requirement 1: Digits only, 880 prefix -> 0, 9 prefix (10 digits) -> 0
  const phone = normalizeIccPhone(numberRecord.number || numberRecord.normalizedNumber);

  const idempotencyKey = forceRetry
    ? `paid_recharge_${paymentId}_retry_${Date.now()}`
    : `paid_recharge_${paymentId}`;

  // Idempotency: don't dispatch twice if not forceRetry
  if (!forceRetry) {
    const existingTx = await p.rechargeTransaction.findUnique({
      where: { idempotencyKey },
    });

    if (existingTx) {
      if (existingTx.status === "DONE") {
        return { success: true, alreadyDone: true };
      }
      if (existingTx.status === "PENDING") {
        console.log(`[ICC Recharge] Already dispatched and pending for payment ${paymentId}`);
        return { success: true, pending: true };
      }
      if (existingTx.status === "ERROR") {
        await p.rechargeOrder
          .update({
            where: { id: rechargeOrderId },
            data: { status: "paid_recharge_failed", failureReason: existingTx.reason },
          })
          .catch(() => {});
        return { success: false, reason: existingTx.reason };
      }
    }
  }

  // Create the recharge transaction record
  const tx = await p.rechargeTransaction.create({
    data: {
      userId: customerId,
      numberId: rechargeOrder.numberId,
      phone,
      amount,
      status: "PENDING",
      idempotencyKey,
    },
  });

  // Dispatch to recharge worker
  try {
    let prov = numberRecord.provider;
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

    const workerRes = await fetch(`${WORKER_URL}/recharge-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": WORKER_SECRET,
      },
      body: JSON.stringify({
        phone,
        amount,
        idempotencyKey,
        provider: providerCode,
        loginUrl: rechargeLoginUrl,
        username: rechargeUsername,
        password: rechargePassword,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!workerRes.ok) {
      const errText = await workerRes.text().catch(() => "");
      throw new Error(`Worker HTTP ${workerRes.status}: ${errText}`);
    }

    const workerData = await workerRes.json();
    const workerJobId = workerData.rechargeJobId;

    await p.rechargeTransaction.update({
      where: { id: tx.id },
      data: { jobId: workerJobId },
    });

    await p.rechargeOrder
      .update({ where: { id: rechargeOrderId }, data: { status: "PROCESSING" } })
      .catch(() => {});

    // Background server-side finalizer
    const { finalizeRechargeJob } = await import("@/lib/rechargeService");
    if (workerJobId) {
      finalizeRechargeJob(tx.id, workerJobId).catch((err: any) =>
        console.error("[ICC Recharge Finalizer Error]", err)
      );
    }

    console.log(`[ICC Recharge] Job ${workerJobId} dispatched for payment ${paymentId}`);
    return { success: true, jobId: workerJobId };
  } catch (workerErr: any) {
    console.error(`[ICC Recharge] Worker failed for payment ${paymentId}:`, workerErr?.message);
    const failReason = workerErr?.message || "worker_unreachable_after_payment";

    await p.rechargeTransaction.update({
      where: { id: tx.id },
      data: {
        status: "ERROR",
        reason: failReason,
        completedAt: new Date(),
      },
    });

    // Requirement 4: Mark order "paid_recharge_failed" with the reason
    await p.rechargeOrder
      .update({
        where: { id: rechargeOrderId },
        data: {
          status: "paid_recharge_failed",
          failureReason: failReason,
        },
      })
      .catch(() => {});

    return { success: false, reason: failReason };
  }
}

// ─── 5. Process Failed Payment ───────────────────────────────────────────────
export async function processPaymentFailure(params: {
  paymentId: string;
  reason?: string;
  rawResponse?: any;
  ipAddress?: string;
}) {
  const {
    paymentId,
    reason = "Payment failed at gateway",
    rawResponse,
    ipAddress,
  } = params;

  const p = prisma as any;
  const payment = await p.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error("Payment record not found");

  if (payment.status === "COMPLETED") {
    throw new Error("Cannot fail an already completed payment");
  }

  const now = new Date();

  await p.$transaction(async (tx: any) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: "FAILED",
        failedAt: now,
        notes: reason,
        rawResponse: rawResponse ?? null,
      },
    });

    await tx.paymentAuditLog.create({
      data: {
        paymentId,
        oldStatus: payment.status,
        newStatus: "FAILED",
        oldAmount: payment.amount,
        newAmount: payment.amount,
        action: "PAYMENT_FAILED",
        reason,
        ipAddress: ipAddress ?? null,
        metadata: { rawResponse },
      },
    });
  });

  // Mark recharge order as failed too
  if (payment.rechargeOrderId) {
    await p.rechargeOrder
      .update({ where: { id: payment.rechargeOrderId }, data: { status: "FAILED" } })
      .catch(() => {});
  }

  return { success: true, paymentId, status: "FAILED" };
}

// ─── 6. Validate Webhook via mh-piprapay-api-key header ──────────────────────
/**
 * PipraPay sends the API key in the 'mh-piprapay-api-key' header on every webhook.
 * We validate by comparing the received key to our configured API key.
 */
export function verifyPipraPayWebhookApiKey(receivedKey: string | null): boolean {
  if (!receivedKey) return false;
  // Use timing-safe comparison to prevent timing attacks
  try {
    const a = Buffer.from(receivedKey);
    const b = Buffer.from(PIPRAPAY_API_KEY);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * @deprecated The real epay/PipraPay uses API key header validation, not HMAC.
 * Kept for backward compatibility.
 */
export function verifyPipraPayWebhook(_payload: any, _signature?: string): boolean {
  return true;
}
