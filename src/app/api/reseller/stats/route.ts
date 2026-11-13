import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const p = prisma as any;
    const resellerId = session.resellerId;

    const [
      customerCount,
      numberCount,
      rechargeCount,
      rechargeTotalResult,
      recentTransactions,
      recentRecharges,
    ] = await Promise.all([
      p.customer.count({ where: { resellerId } }),
      p.number.count({ where: { resellerId } }),
      p.rechargeTransaction.count({ where: { resellerId } }),
      p.rechargeTransaction.aggregate({
        where: { resellerId, status: "DONE" },
        _sum: { amount: true, resellerDiscount: true },
      }),
      p.resellerTransaction.findMany({
        where: { resellerId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      p.rechargeTransaction.findMany({
        where: { resellerId },
        include: {
          number: { select: { number: true } },
          customer: { select: { fullName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        balance: session.balance,
        currency: session.currency,
        numberDiscountPercent: session.numberDiscountPercent,
        rechargeDiscountPercent: session.rechargeDiscountPercent,
        totalCustomers: customerCount,
        totalNumbers: numberCount,
        totalRecharges: rechargeCount,
        totalRechargedAmount: Number(rechargeTotalResult._sum.amount || 0),
        totalDiscountSaved: Number(rechargeTotalResult._sum.resellerDiscount || 0),
      },
      recentTransactions,
      recentRecharges,
    });
  } catch (error: any) {
    console.error("[Reseller Stats API Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to fetch stats" }, { status: 500 });
  }
}
