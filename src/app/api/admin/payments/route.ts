import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));
    const skip = (page - 1) * limit;

    const p = prisma as any;
    const where: any = {};
    if (status && status !== "ALL") where.status = status;

    const [total, payments, stats] = await Promise.all([
      p.payment.count({ where }),
      p.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          order: {
            select: { id: true, orderNumber: true, totalAmount: true },
          },
          auditLogs: {
            take: 3,
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      p.payment.groupBy({
        by: ["status"],
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    return NextResponse.json({
      payments,
      stats,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch payments" },
      { status: 500 }
    );
  }
}
