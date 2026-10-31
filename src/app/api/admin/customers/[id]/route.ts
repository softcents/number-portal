import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/customers/[id] — full customer profile with numbers, wallets, orders
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const p = prisma as any;
    const customer = await p.customer.findUnique({
      where: { id },
      include: {
        numbers: {
          include: {
            provider: { select: { code: true } },
            displayCompany: { select: { code: true } },
            wallet: { select: { id: true, balance: true, status: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        wallets: {
          include: { number: { select: { number: true } } },
          orderBy: { createdAt: "desc" },
        },
        orders: {
          include: {
            items: { include: { number: { select: { number: true } } } },
            payments: { select: { id: true, amount: true, status: true, gateway: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(customer);
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 });
  }
}

// PATCH /api/admin/customers/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const p = prisma as any;
    const allowed = [
      "fullName",
      "email",
      "phoneNumber",
      "customerType",
      "companyName",
      "companyPosition",
      "isActive",
      "notes",
    ];
    const data: any = {};
    for (const key of allowed) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    const updated = await p.customer.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
