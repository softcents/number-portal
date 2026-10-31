import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // ── Admin Authorization Verification ────────────────────────────────────
    const adminToken = req.cookies.get("admin_token")?.value;
    if (!adminToken) {
      return NextResponse.json(
        { error: "Unauthorized: Admin session required" },
        { status: 401 }
      );
    }

    const admin = await prisma.admin.findUnique({
      where: { id: adminToken },
    });
    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid admin session" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "ALL";
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || "50")));

    const where: any = {};
    if (status !== "ALL") {
      where.status = status.toUpperCase();
    }

    const p = prisma as any;
    const [total, rows] = await Promise.all([
      p.rechargeTransaction.count({ where }),
      p.rechargeTransaction.findMany({
        where,
        include: {
          customer: { select: { fullName: true, email: true } },
          number: { select: { number: true, displayCompany: { select: { code: true } } } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      total,
      rows: rows.map((r: any) => ({
        id: r.id,
        phone: r.phone,
        amount: Number(r.amount),
        status: r.status,
        reason: r.reason,
        balanceBefore: r.balanceBefore ? Number(r.balanceBefore) : null,
        balanceAfter: r.balanceAfter ? Number(r.balanceAfter) : null,
        durationMs: r.durationMs,
        reference: r.reference,
        idempotencyKey: r.idempotencyKey,
        jobId: r.jobId,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        customerName: r.customer?.fullName || "—",
        customerEmail: r.customer?.email || "—",
        network: r.number?.displayCompany?.code || "ICC",
      })),
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error("[Admin Recharges Error]", error);
    return NextResponse.json({ error: "Failed to fetch recharge transactions" }, { status: 500 });
  }
}
