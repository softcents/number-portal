import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { numberId, customerId } = body; // customerId can be null to unassign

    if (!numberId) {
      return NextResponse.json({ error: "Number ID is required" }, { status: 400 });
    }

    const p = prisma as any;

    // Verify ownership of the number
    const num = await p.number.findFirst({
      where: { id: numberId, resellerId: session.resellerId },
    });

    if (!num) {
      return NextResponse.json({ error: "Number not found or not owned by your account" }, { status: 404 });
    }

    // If assigning, verify customer belongs to this reseller
    let targetCustomer = null;
    if (customerId) {
      targetCustomer = await p.customer.findFirst({
        where: { id: customerId, resellerId: session.resellerId },
      });
      if (!targetCustomer) {
        return NextResponse.json({ error: "Customer not found under your account" }, { status: 404 });
      }
    }

    const updated = await p.number.update({
      where: { id: numberId },
      data: {
        customerId: targetCustomer ? targetCustomer.id : null,
        status: targetCustomer ? "ASSIGNED" : "AVAILABLE",
      },
      include: {
        customer: true,
      },
    });

    // Ensure wallet is created/updated
    if (targetCustomer) {
      await p.numberWallet.upsert({
        where: { numberId: num.id },
        update: { customerId: targetCustomer.id, status: "ACTIVE" },
        create: {
          numberId: num.id,
          customerId: targetCustomer.id,
          balance: 0,
          currency: "BDT",
          status: "ACTIVE",
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: targetCustomer
        ? `Number assigned to ${targetCustomer.fullName}`
        : "Number unassigned and returned to your available stock",
      number: updated,
    });
  } catch (error: any) {
    console.error("[Reseller Assign Number Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to update assignment" }, { status: 500 });
  }
}
