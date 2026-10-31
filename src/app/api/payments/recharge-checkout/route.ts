import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/centralAuth";
import { createCheckoutSession, normalizeIccPhone } from "@/lib/piprapayService";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/recharge-checkout
 *
 * Initiates a PipraPay payment for an ICC Talk phone number top-up.
 * The customer MUST pay through PipraPay first. Only after the payment
 * is confirmed (via webhook or redirect verification) will the ICC Talk
 * recharge be executed.
 *
 * Body: { numberId, phone, amount }
 * Returns: { success, paymentId, paymentUrl, amount, currency }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getClientSession(req);
    if (!session || !session.customerId) {
      return NextResponse.json(
        { error: "Unauthorized: Please log in" },
        { status: 401 }
      );
    }

    const userId = session.customerId;
    const body = await req.json();
    const { numberId, phone, amount: rawAmount } = body;

    if (!phone && !numberId) {
      return NextResponse.json(
        { error: "Phone number or numberId is required" },
        { status: 400 }
      );
    }

    const amount = Number(rawAmount);
    if (isNaN(amount) || amount < 1 || amount > 5000) {
      return NextResponse.json(
        { error: "Amount must be between ৳1 and ৳5,000 BDT" },
        { status: 400 }
      );
    }

    if (Math.round(amount * 100) !== amount * 100) {
      return NextResponse.json(
        { error: "Amount can have at most 2 decimal places" },
        { status: 400 }
      );
    }

    const p = prisma as any;

    // 1. Verify the customer owns this number and it's ACTIVE
    const cleanPhone = phone ? phone.replace(/\D/g, "") : undefined;
    const numberWhere: any = { customerId: userId, status: "ACTIVE" };
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
      include: { customer: true },
    });

    if (!numberRecord) {
      return NextResponse.json(
        { error: "Access denied: Number not found or not active in your account" },
        { status: 403 }
      );
    }

    // 2. Fetch customer info for PipraPay checkout
    const customer = await p.customer.findUnique({
      where: { id: userId },
    });

    // 3. Create a RechargeOrder record to track this pending recharge
    const idempotencyKey = `rc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const rechargeOrder = await p.rechargeOrder.create({
      data: {
        customerId: userId,
        numberId: numberRecord.id,
        amount,
        currency: "BDT",
        status: "PENDING",
        idempotencyKey,
      },
    });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const host = process.env.NEXT_PUBLIC_APP_URL || "https://myaccount.softcents.com";

    const storedPhone = normalizeIccPhone(numberRecord.number || numberRecord.normalizedNumber);

    // 4. Create a PipraPay payment session
    const session_ = await createCheckoutSession({
      customerId: userId,
      rechargeOrderId: rechargeOrder.id,
      numberId: numberRecord.id,
      amount,
      currency: "BDT",
      customerName: customer?.fullName || "Valued Customer",
      customerEmail: customer?.email || "customer@softcents.com",
      customerPhone: storedPhone || customer?.phoneNumber || "",
      redirectUrl: `${host}/portal?payment=recharge_success&paymentId=PAYMENT_ID_PLACEHOLDER&phone=${encodeURIComponent(storedPhone)}`,
      cancelUrl: `${host}/portal?payment=recharge_cancelled&rechargeOrderId=${rechargeOrder.id}`,
      webhookUrl: `${host}/api/payments/webhook`,
      ipAddress: ip,
    });

    // Fix the redirect URL to include the actual paymentId
    const paymentUrl = session_.paymentUrl?.replace(
      "PAYMENT_ID_PLACEHOLDER",
      session_.paymentId
    );

    return NextResponse.json({
      success: true,
      paymentId: session_.paymentId,
      rechargeOrderId: rechargeOrder.id,
      paymentUrl,
      amount,
      currency: "BDT",
      phone: storedPhone,
      isSandbox: session_.isSandbox ?? false,
    });
  } catch (error: any) {
    console.error("[Recharge Checkout API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create payment session" },
      { status: 500 }
    );
  }
}
