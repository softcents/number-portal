import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const p = prisma as any;
    const reseller = await p.reseller.findUnique({
      where: { id: session.resellerId },
      select: {
        id: true,
        companyName: true,
        brandName: true,
        pgType: true,
        pgApiKey: true,
        pgBaseUrl: true,
        pgIsActive: true,
        manualPaymentInstructions: true,
        manualBkashNumber: true,
        manualNagadNumber: true,
        manualRocketNumber: true,
      },
    });

    if (!reseller) {
      return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
    }

    // Calculate customer deposit stats
    const [depositAgg, depositCount] = await Promise.all([
      p.customerBalanceTransaction.aggregate({
        where: {
          resellerId: session.resellerId,
          type: "DEPOSIT",
        },
        _sum: { amount: true },
      }),
      p.customerBalanceTransaction.count({
        where: {
          resellerId: session.resellerId,
          type: "DEPOSIT",
        },
      }),
    ]);

    // Mask API Key for security (show only last 6 chars)
    const rawKey = reseller.pgApiKey || "";
    const maskedKey =
      rawKey.length > 8 ? `••••••••••••••••${rawKey.slice(-6)}` : rawKey ? "••••••••" : "";

    return NextResponse.json({
      success: true,
      gateway: {
        pgType: reseller.pgType || "PIPRAPAY",
        pgApiKeyMasked: maskedKey,
        hasApiKey: Boolean(rawKey),
        pgBaseUrl: reseller.pgBaseUrl || "https://epay.softcents.com/api",
        pgIsActive: Boolean(reseller.pgIsActive),
        manualPaymentInstructions: reseller.manualPaymentInstructions || "",
        manualBkashNumber: reseller.manualBkashNumber || "",
        manualNagadNumber: reseller.manualNagadNumber || "",
        manualRocketNumber: reseller.manualRocketNumber || "",
      },
      stats: {
        totalDepositsAmount: Number(depositAgg._sum.amount || 0),
        totalDepositsCount: depositCount,
      },
    });
  } catch (error: any) {
    console.error("[Reseller Gateway GET Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load gateway settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      pgIsActive,
      pgApiKey,
      pgBaseUrl,
      manualPaymentInstructions,
      manualBkashNumber,
      manualNagadNumber,
      manualRocketNumber,
    } = body;

    const p = prisma as any;
    const updateData: any = {};

    if (typeof pgIsActive === "boolean") {
      updateData.pgIsActive = pgIsActive;
    }

    // Only update API key if user sent a non-masked new string
    if (typeof pgApiKey === "string") {
      const trimmedKey = pgApiKey.trim();
      if (!trimmedKey.startsWith("•••")) {
        updateData.pgApiKey = trimmedKey || null;
      }
    }

    if (typeof pgBaseUrl === "string") {
      updateData.pgBaseUrl = pgBaseUrl.trim() || "https://epay.softcents.com/api";
    }

    if (manualPaymentInstructions !== undefined) {
      updateData.manualPaymentInstructions = manualPaymentInstructions || null;
    }
    if (manualBkashNumber !== undefined) {
      updateData.manualBkashNumber = manualBkashNumber || null;
    }
    if (manualNagadNumber !== undefined) {
      updateData.manualNagadNumber = manualNagadNumber || null;
    }
    if (manualRocketNumber !== undefined) {
      updateData.manualRocketNumber = manualRocketNumber || null;
    }

    const updated = await p.reseller.update({
      where: { id: session.resellerId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "Payment gateway configuration saved successfully",
      gateway: {
        pgType: updated.pgType,
        hasApiKey: Boolean(updated.pgApiKey),
        pgBaseUrl: updated.pgBaseUrl,
        pgIsActive: updated.pgIsActive,
      },
    });
  } catch (error: any) {
    console.error("[Reseller Gateway POST Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update gateway settings" },
      { status: 500 }
    );
  }
}
