import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET /api/admin/resellers
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const p = prisma as any;

    const where: any = {};
    if (q) {
      where.OR = [
        { companyName: { contains: q, mode: "insensitive" } },
        { brandName: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { subdomain: { contains: q, mode: "insensitive" } },
      ];
    }

    const resellers = await p.reseller.findMany({
      where,
      include: {
        _count: {
          select: {
            customers: true,
            numbers: true,
            rechargeTransactions: true,
            transactions: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, resellers });
  } catch (error: any) {
    console.error("[Admin Resellers GET Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to fetch resellers" }, { status: 500 });
  }
}

// POST /api/admin/resellers — Create new reseller
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      username,
      password,
      companyName,
      brandName,
      email,
      phoneNumber,
      subdomain,
      brandColor,
      numberDiscountPercent = 0,
      rechargeDiscountPercent = 0,
      initialBalance = 0,
      notes,
    } = body;

    if (!username || !password || !companyName || !email) {
      return NextResponse.json(
        { error: "Username, password, company name, and email are required" },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanSubdomain = subdomain ? subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") : null;
    const p = prisma as any;

    // Check uniqueness
    const existing = await p.reseller.findFirst({
      where: {
        OR: [
          { username: cleanUsername },
          { email: cleanEmail },
          ...(cleanSubdomain ? [{ subdomain: cleanSubdomain }] : []),
        ],
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A reseller with this username, email, or subdomain already exists" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const balanceNum = Number(initialBalance) || 0;

    const reseller = await p.reseller.create({
      data: {
        username: cleanUsername,
        passwordHash,
        companyName: companyName.trim(),
        brandName: (brandName || companyName).trim(),
        email: cleanEmail,
        phoneNumber: phoneNumber?.trim() || null,
        subdomain: cleanSubdomain,
        brandColor: brandColor || "#2563eb",
        numberDiscountPercent: Number(numberDiscountPercent) || 0,
        rechargeDiscountPercent: Number(rechargeDiscountPercent) || 0,
        balance: balanceNum,
        currency: "BDT",
        status: "ACTIVE",
        notes: notes?.trim() || null,
      },
    });

    // Record initial deposit transaction if > 0
    if (balanceNum > 0) {
      await p.resellerTransaction.create({
        data: {
          resellerId: reseller.id,
          type: "DEPOSIT",
          amount: balanceNum,
          discountAmount: 0,
          netAmount: balanceNum,
          balanceBefore: 0,
          balanceAfter: balanceNum,
          notes: "Initial balance granted by administrator",
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Reseller account created successfully",
      reseller,
    });
  } catch (error: any) {
    console.error("[Admin Resellers POST Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to create reseller" }, { status: 500 });
  }
}
