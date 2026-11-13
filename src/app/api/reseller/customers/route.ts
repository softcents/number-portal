import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";

// GET /api/reseller/customers
export async function GET(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const p = prisma as any;

    const where: any = {
      resellerId: session.resellerId,
    };

    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phoneNumber: { contains: q } },
        { companyName: { contains: q, mode: "insensitive" } },
      ];
    }

    const customers = await p.customer.findMany({
      where,
      include: {
        _count: {
          select: { numbers: true, rechargeTransactions: true },
        },
        numbers: {
          select: {
            id: true,
            number: true,
            status: true,
            wallet: {
              select: { balance: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      customers,
    });
  } catch (error: any) {
    console.error("[Reseller Customers GET Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to fetch customers" }, { status: 500 });
  }
}

// POST /api/reseller/customers — Create a new sub-customer under this reseller
export async function POST(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { fullName, email, phoneNumber, companyName, password } = body;

    if (!fullName || !email) {
      return NextResponse.json(
        { error: "Customer full name and email are required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const p = prisma as any;

    // Check if email already exists
    const existing = await p.customer.findFirst({
      where: { email: cleanEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A customer with this email already exists" },
        { status: 400 }
      );
    }

    let hashedPassword: string | null = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const centralIdentityUserId = `reseller_${session.resellerId.slice(0, 6)}_${crypto.randomBytes(4).toString("hex")}`;

    const customer = await p.customer.create({
      data: {
        centralIdentityUserId,
        fullName: fullName.trim(),
        email: cleanEmail,
        phoneNumber: phoneNumber?.trim() || null,
        companyName: companyName?.trim() || null,
        customerType: companyName ? "COMPANY" : "INDIVIDUAL",
        password: hashedPassword,
        resellerId: session.resellerId,
        isActive: true,
        kycVerifiedAt: new Date(), // pre-verified by reseller
        notes: `Created by Reseller: ${session.companyName} (${session.username})`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Customer created successfully",
      customer,
    });
  } catch (error: any) {
    console.error("[Reseller Customers POST Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to create customer" }, { status: 500 });
  }
}
