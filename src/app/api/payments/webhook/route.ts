import { NextRequest, NextResponse } from "next/server";
import {
  processPaymentSuccess,
  processPaymentFailure,
  verifyPipraPayWebhookApiKey,
  verifyWithPipraPay,
} from "@/lib/piprapayService";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    // PipraPay / epay: webhook is authenticated via MHS-PIPRAPAY-API-KEY or mh-piprapay-api-key header
    const receivedApiKey =
      req.headers.get("mhs-piprapay-api-key") ||
      req.headers.get("MHS-PIPRAPAY-API-KEY") ||
      req.headers.get("mh-piprapay-api-key") ||
      req.headers.get("Mh-Piprapay-Api-Key");

    if (!verifyPipraPayWebhookApiKey(receivedApiKey)) {
      console.warn("[PipraPay Webhook] Invalid API key from IP:", ip);
      return NextResponse.json({ error: "Unauthorized request." }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // PipraPay v1.2 webhook payload fields
    const {
      pp_id,
      status,
      transaction_id,
      metadata,
      amount,
    } = payload;

    if (!pp_id) {
      return NextResponse.json(
        { error: "Missing pp_id in webhook payload" },
        { status: 400 }
      );
    }

    // Parse metadata whether it is an object or a JSON string
    let parsedMetadata = metadata;
    if (typeof metadata === "string") {
      try {
        parsedMetadata = JSON.parse(metadata);
      } catch {}
    }

    // Resolve our internal payment ID from metadata
    let targetPaymentId: string | null =
      parsedMetadata?.payment_id || null;

    // If metadata.payment_id not available, look up by gatewayPaymentId (pp_id / invoice_id)
    if (!targetPaymentId) {
      const p = prisma as any;
      const existingPayment = await p.payment.findFirst({
        where: {
          OR: [
            { gatewayPaymentId: pp_id },
            { gatewayTransactionId: pp_id },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      targetPaymentId = existingPayment?.id ?? null;
    }

    if (!targetPaymentId) {
      console.warn("[PipraPay Webhook] Could not resolve payment for pp_id:", pp_id);
      // ACK to prevent PipraPay from retrying for unresolvable webhooks
      return NextResponse.json({ status: true, message: "Webhook received (unresolvable)" });
    }

    const normalizedStatus = (status || "").toLowerCase();

    if (normalizedStatus === "completed" || normalizedStatus === "paid" || normalizedStatus === "success") {
      // Double-verify with PipraPay's verify-payment endpoint for safety
      const verification = await verifyWithPipraPay(pp_id);

      if (!verification.verified) {
        console.warn(`[PipraPay Webhook] Payment ${pp_id} webhook claimed completed but verify-payment says otherwise. Status: ${verification.status}`);
        // Still record the webhook received but don't fulfill yet
        return NextResponse.json({ status: true, message: "Webhook received; verification pending" });
      }

      const result = await processPaymentSuccess({
        paymentId: targetPaymentId,
        gatewayTransactionId: transaction_id || pp_id,
        ppId: pp_id,
        rawResponse: payload,
        actorId: "piprapay_webhook",
        ipAddress: ip,
      });

      console.log(`[PipraPay Webhook] Payment ${targetPaymentId} confirmed. ICC recharge dispatched.`);

      return NextResponse.json({
        status: true,
        message: "Payment verified and recharge dispatched",
        result,
      });
    } else {
      // Payment failed or cancelled
      const result = await processPaymentFailure({
        paymentId: targetPaymentId,
        reason: payload.message || `Gateway returned status: ${status}`,
        rawResponse: payload,
        ipAddress: ip,
      });

      return NextResponse.json({
        status: true,
        message: "Payment failure recorded",
        result,
      });
    }
  } catch (error: any) {
    console.error("[PipraPay Webhook Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}
