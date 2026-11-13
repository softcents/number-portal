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

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") || 50), 100);
    const p = prisma as any;

    const [transactions, totalCount] = await Promise.all([
      p.customerBalanceTransaction.findMany({
        where: {
          resellerId: session.resellerId,
        },
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phoneNumber: true,
              customerType: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      p.customerBalanceTransaction.count({
        where: { resellerId: session.resellerId },
      }),
    ]);

    return NextResponse.json({
      success: true,
      totalCount,
      transactions: transactions.map((tx: any) => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        balanceBefore: Number(tx.balanceBefore),
        balanceAfter: Number(tx.balanceAfter),
        referenceId: tx.referenceId,
        description: tx.description,
        createdAt: tx.createdAt,
        customer: tx.customer,
      })),
    });
  } catch (error: any) {
    console.error("[Reseller Gateway Transactions GET Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load transactions" },
      { status: 500 }
    );
  }
}
