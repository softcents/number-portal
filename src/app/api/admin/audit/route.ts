import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/audit — system audit log
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const resource = searchParams.get("resource");
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "50");
    const p = prisma as any;

    const where: any = {};
    if (resource && resource !== "ALL") where.resource = resource;

    const [total, rows] = await Promise.all([
      p.systemAuditLog.count({ where }),
      p.systemAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({ total, rows, page, pageSize, pages: Math.ceil(total / pageSize) });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }
}
