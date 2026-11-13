import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET /api/admin/resellers/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const p = prisma as any;

    const reseller = await p.reseller.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            customers: true,
            numbers: true,
            rechargeTransactions: true,
            transactions: true,
          },
        },
        customers: {
          take: 20,
          orderBy: { createdAt: "desc" },
        },
        numbers: {
          take: 20,
          orderBy: { createdAt: "desc" },
        },
        transactions: {
          take: 20,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!reseller) {
      return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, reseller });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}

// PUT /api/admin/resellers/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      companyName,
      brandName,
      email,
      phoneNumber,
      subdomain,
      customDomain,
      brandColor,
      numberDiscountPercent,
      rechargeDiscountPercent,
      status,
      password,
      notes,
    } = body;

    const p = prisma as any;
    const existing = await p.reseller.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (companyName) updateData.companyName = companyName.trim();
    if (brandName) updateData.brandName = brandName.trim();
    if (email) updateData.email = email.trim().toLowerCase();
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber?.trim() || null;
    if (subdomain !== undefined) updateData.subdomain = subdomain ? subdomain.trim().toLowerCase() : null;
    if (customDomain !== undefined) updateData.customDomain = customDomain ? customDomain.trim().toLowerCase() : null;
    if (brandColor !== undefined) updateData.brandColor = brandColor || "#2563eb";
    if (numberDiscountPercent !== undefined) updateData.numberDiscountPercent = Number(numberDiscountPercent) || 0;
    if (rechargeDiscountPercent !== undefined) updateData.rechargeDiscountPercent = Number(rechargeDiscountPercent) || 0;
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const updated = await p.reseller.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "Reseller updated successfully",
      reseller: updated,
    });
  } catch (error: any) {
    console.error("[Admin Reseller PUT Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to update reseller" }, { status: 500 });
  }
}

// DELETE /api/admin/resellers/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const p = prisma as any;

    const reseller = await p.reseller.findUnique({
      where: { id },
      include: {
        _count: { select: { numbers: true, customers: true } },
      },
    });

    if (!reseller) {
      return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
    }

    if (reseller._count.numbers > 0 || reseller._count.customers > 0) {
      // Rather than cascade delete and corrupt data, mark INACTIVE
      await p.reseller.update({
        where: { id },
        data: { status: "INACTIVE" },
      });
      return NextResponse.json({
        success: true,
        message: "Reseller marked as INACTIVE (cannot be deleted because numbers or customers are attached)",
      });
    }

    await p.reseller.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Reseller deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
