import { NextRequest, NextResponse } from "next/server";
import { getOrders, expireStaleOrders } from "@/lib/orderService";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    // Clean up expired reservations on every list access
    expireStaleOrders().catch((e) => console.error("Stale order check error:", e));

    const p = prisma as any;
    const [result, counts, revenue] = await Promise.all([
      getOrders({ status, search, page, limit }),
      p.order.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      p.order.aggregate({
        where: { status: "PAID" },
        _sum: { totalAmount: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const c of counts) {
      statusCounts[c.status] = c._count.id;
    }

    return NextResponse.json({
      success: true,
      ...result,
      metrics: {
        totalOrders: result.pagination.total,
        statusCounts,
        totalRevenue: Number(revenue._sum.totalAmount || 0),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch admin orders" },
      { status: 500 }
    );
  }
}
