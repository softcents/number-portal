import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const p = prisma as any;

    const customer = await p.customer.findFirst({
      where: {
        id,
        resellerId: session.resellerId,
      },
      include: {
        numbers: {
          include: {
            wallet: true,
            provider: { select: { name: true, code: true } },
          },
        },
        rechargeTransactions: {
          take: 20,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, customer });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { fullName, phoneNumber, companyName, isActive, password } = body;
    const p = prisma as any;

    const existing = await p.customer.findFirst({
      where: { id, resellerId: session.resellerId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (fullName) updateData.fullName = fullName.trim();
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber?.trim() || null;
    if (companyName !== undefined) updateData.companyName = companyName?.trim() || null;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updated = await p.customer.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, customer: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const p = prisma as any;

    const existing = await p.customer.findFirst({
      where: { id, resellerId: session.resellerId },
      include: { _count: { select: { numbers: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    if (existing._count.numbers > 0) {
      return NextResponse.json(
        { error: "Cannot delete customer with assigned numbers. Reassign or remove numbers first." },
        { status: 400 }
      );
    }

    await p.customer.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Customer deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
