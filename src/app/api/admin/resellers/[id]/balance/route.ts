import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/admin/resellers/[id]/balance — Credit or Debit balance
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, amount: rawAmount, notes } = body; // action: "CREDIT" | "DEBIT"

    const amount = Number(rawAmount);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    if (action !== "CREDIT" && action !== "DEBIT") {
      return NextResponse.json({ error: "Action must be CREDIT or DEBIT" }, { status: 400 });
    }

    const p = prisma as any;

    const result = await p.$transaction(async (tx: any) => {
      const reseller = await tx.reseller.findUnique({ where: { id } });
      if (!reseller) {
        throw new Error("Reseller not found");
      }

      const currentBalance = Number(reseller.balance || 0);
      let newBalance = currentBalance;

      if (action === "CREDIT") {
        newBalance = Number((currentBalance + amount).toFixed(2));
      } else {
        if (currentBalance < amount) {
          throw new Error(`Cannot debit ৳${amount}. Reseller balance is only ৳${currentBalance}.`);
        }
        newBalance = Number((currentBalance - amount).toFixed(2));
      }

      await tx.reseller.update({
        where: { id },
        data: { balance: newBalance },
      });

      const txLog = await tx.resellerTransaction.create({
        data: {
          resellerId: id,
          type: action === "CREDIT" ? "DEPOSIT" : "ADJUSTMENT",
          amount,
          discountAmount: 0,
          netAmount: amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          notes: notes || `Admin ${action === "CREDIT" ? "Balance Deposit" : "Balance Deduction"}`,
        },
      });

      return {
        newBalance,
        transaction: txLog,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Reseller balance updated successfully. New balance: ৳${result.newBalance} BDT`,
      data: result,
    });
  } catch (error: any) {
    console.error("[Admin Reseller Balance Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to update balance" }, { status: 400 });
  }
}
