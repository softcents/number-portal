import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";
import { prisma } from "@/lib/prisma";

// GET /api/reseller/wallet
export async function GET(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") || "1");
    const pageSize = Number(searchParams.get("pageSize") || "50");
    const p = prisma as any;

    const [reseller, totalTx, transactions] = await Promise.all([
      p.reseller.findUnique({
        where: { id: session.resellerId },
        select: { balance: true, currency: true, companyName: true, brandName: true },
      }),
      p.resellerTransaction.count({ where: { resellerId: session.resellerId } }),
      p.resellerTransaction.findMany({
        where: { resellerId: session.resellerId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      success: true,
      balance: Number(reseller?.balance || 0),
      currency: reseller?.currency || "BDT",
      totalTransactions: totalTx,
      transactions,
      page,
      pageSize,
    });
  } catch (error: any) {
    console.error("[Reseller Wallet GET Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to fetch wallet" }, { status: 500 });
  }
}

// POST /api/reseller/wallet — Create deposit / recharge session
export async function POST(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { amount: rawAmount, paymentMethod = "PIPRAPAY" } = body;
    const amount = Number(rawAmount);

    if (isNaN(amount) || amount < 10) {
      return NextResponse.json({ error: "Deposit amount must be at least ৳10 BDT" }, { status: 400 });
    }

    const p = prisma as any;
    const apiKey = process.env.PIPRAPAY_API_KEY;
    const baseUrl = process.env.PIPRAPAY_BASE_URL || "https://epay.softcents.com/api";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://number-portal.softcents.com";

    // Call PipraPay to create payment invoice
    try {
      const pipraRes = await fetch(`${baseUrl}/create-charge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey || "",
        },
        body: JSON.stringify({
          amount,
          currency: "BDT",
          customer_name: session.companyName,
          customer_email: session.email,
          customer_phone: session.supportPhone || "01700000000",
          redirect_url: `${appUrl}/api/reseller/wallet/return?resellerId=${session.resellerId}`,
          cancel_url: `${appUrl}/reseller/wallet?status=cancelled`,
          webhook_url: `${appUrl}/api/reseller/wallet/webhook`,
          metadata: {
            resellerId: session.resellerId,
            type: "RESELLER_DEPOSIT",
          },
        }),
      });

      if (pipraRes.ok) {
        const pipraData = await pipraRes.json();
        const paymentUrl = pipraData.payment_url || pipraData.url || pipraData.data?.payment_url;
        if (paymentUrl) {
          return NextResponse.json({ success: true, paymentUrl });
        }
      }
    } catch (payErr) {
      console.warn("[PipraPay create-charge warning]:", payErr);
    }

    // In case sandbox or direct simulation:
    return NextResponse.json({
      success: true,
      message: "Please contact administration for manual balance top up or invoice creation.",
      manualDeposit: true,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Deposit error" }, { status: 500 });
  }
}
