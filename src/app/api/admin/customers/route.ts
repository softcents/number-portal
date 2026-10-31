import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/customers
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "50");
    const p = prisma as any;

    const where: any = {};
    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phoneNumber: { contains: q } },
        { centralIdentityUserId: { contains: q } },
      ];
    }

    const [total, rows] = await Promise.all([
      p.customer.count({ where }),
      p.customer.findMany({
        where,
        include: {
          _count: { select: { numbers: true, orders: true, wallets: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({ total, rows, page, pageSize, pages: Math.ceil(total / pageSize) });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
}

// POST /api/admin/customers — upsert from Central Identity profile
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { centralIdentityUserId, fullName, email, phoneNumber, nidHash,
            customerType, companyName, companyPosition, kycVerifiedAt } = body;
    const p = prisma as any;

    if (!centralIdentityUserId || !fullName || !email) {
      return NextResponse.json({ error: "centralIdentityUserId, fullName, email are required" }, { status: 400 });
    }

    const customer = await p.customer.upsert({
      where: { centralIdentityUserId },
      update: { fullName, email, phoneNumber: phoneNumber ?? null, customerType: customerType ?? "INDIVIDUAL",
                 companyName: companyName ?? null, companyPosition: companyPosition ?? null,
                 kycVerifiedAt: kycVerifiedAt ? new Date(kycVerifiedAt) : null, updatedAt: new Date() },
      create: { centralIdentityUserId, fullName, email, phoneNumber: phoneNumber ?? null,
                 nidHash: nidHash ?? null, customerType: customerType ?? "INDIVIDUAL",
                 companyName: companyName ?? null, companyPosition: companyPosition ?? null,
                 kycVerifiedAt: kycVerifiedAt ? new Date(kycVerifiedAt) : null },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to upsert customer" }, { status: 400 });
  }
}
