import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/centralAuth";
import { createCheckoutSession } from "@/lib/piprapayService";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getClientSession(req);
    if (!session || !session.customerId) {
      return NextResponse.json(
        { error: "Unauthorized: Please log in to your account" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const amount = Number(body.amount);

    if (isNaN(amount) || amount < 10 || amount > 100000) {
      return NextResponse.json(
        { error: "Deposit amount must be between ৳10 and ৳100,000 BDT" },
        { status: 400 }
      );
    }

    if (Math.round(amount * 100) !== amount * 100) {
      return NextResponse.json(
        { error: "Amount cannot have more than 2 decimal places" },
        { status: 400 }
      );
    }

    const p = prisma as any;
    const customer = await p.customer.findUnique({
      where: { id: session.customerId },
      include: { reseller: true },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const host = (
      process.env.NEXT_PUBLIC_APP_URL || "https://number-portal.softcents.com"
    ).replace(/\/$/, "");

    const redirectUrl = `${host}/portal?deposit=success&paymentId=PAYMENT_ID_PLACEHOLDER`;
    const cancelUrl = `${host}/portal?deposit=cancelled&paymentId=PAYMENT_ID_PLACEHOLDER`;
    const webhookUrl = `${host}/api/payments/webhook`;

    const checkoutSession = await createCheckoutSession({
      customerId: customer.id,
      amount,
      currency: "BDT",
      paymentType: "WALLET_DEPOSIT",
      resellerId: customer.resellerId || undefined,
      customerName: customer.fullName || session.fullName || "Valued Customer",
      customerEmail: customer.email || session.email || "customer@softcents.com",
      customerPhone: customer.phoneNumber || "",
      redirectUrl,
      cancelUrl,
      webhookUrl,
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      paymentId: checkoutSession.paymentId,
      paymentUrl: checkoutSession.paymentUrl,
      amount: checkoutSession.amount,
      currency: checkoutSession.currency,
      isResellerGateway: Boolean(customer.reseller?.pgIsActive && customer.reseller?.pgApiKey),
      resellerName: customer.reseller?.brandName || customer.reseller?.companyName,
    });
  } catch (error: any) {
    console.error("[Deposit Checkout Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to initiate deposit payment" },
      { status: 500 }
    );
  }
}
