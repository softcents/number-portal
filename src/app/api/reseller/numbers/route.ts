import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { resolveCustomerNumberPrice } from "@/lib/numberPricingService";

// GET /api/reseller/numbers?mode=my|pool
export async function GET(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "my";
    const q = searchParams.get("q")?.trim();
    const p = prisma as any;

    if (mode === "pool") {
      // Numbers available in inventory for wholesale purchase
      const where: any = {
        status: "AVAILABLE",
        resellerId: null,
      };

      if (q) {
        where.OR = [
          { number: { contains: q } },
          { normalizedNumber: { contains: q } },
          { city: { contains: q, mode: "insensitive" } },
        ];
      }

      const numbers = await p.number.findMany({
        where,
        include: {
          provider: { select: { id: true, name: true, code: true } },
          displayCompany: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      const discountPercent = Number(session.numberDiscountPercent || 0);

      const items = numbers.map((n: any) => {
        const retailPrice = Number(n.salePrice || 0);
        const discountAmount = Number(((retailPrice * discountPercent) / 100).toFixed(2));
        const resellerWholesalePrice = Number((retailPrice - discountAmount).toFixed(2));

        return {
          id: n.id,
          number: n.number,
          normalizedNumber: n.normalizedNumber,
          numberType: n.numberType,
          city: n.city,
          area: n.area,
          retailPrice,
          discountPercent,
          discountAmount,
          resellerWholesalePrice,
          provider: n.provider,
          displayCompany: n.displayCompany,
          status: n.status,
        };
      });

      return NextResponse.json({ success: true, numbers: items });
    }

    // Default: My numbers (owned by this reseller)
    const where: any = {
      resellerId: session.resellerId,
    };

    if (q) {
      where.OR = [
        { number: { contains: q } },
        { customer: { fullName: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [numbers, reseller] = await Promise.all([
      p.number.findMany({
        where,
        include: {
          customer: { select: { id: true, fullName: true, email: true, phoneNumber: true } },
          provider: { select: { id: true, name: true, code: true } },
          displayCompany: { select: { id: true, name: true, code: true } },
          wallet: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      p.reseller.findUnique({
        where: { id: session.resellerId },
        select: { defaultNumberPricingMode: true, defaultNumberPrice: true },
      }),
    ]);

    const enrichedNumbers = numbers.map((n: any) => {
      const resolved = resolveCustomerNumberPrice(n, reseller);
      return {
        ...n,
        adminBaseRate: Number(n.salePrice || 0),
        effectiveCustomerPrice: resolved.price,
        isCustomerFree: resolved.isFree,
        isCustomPriceSet: resolved.isCustom,
      };
    });

    return NextResponse.json({ success: true, numbers: enrichedNumbers });
  } catch (error: any) {
    console.error("[Reseller Numbers GET Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to fetch numbers" }, { status: 500 });
  }
}

// POST /api/reseller/numbers — Buy a number from the pool at wholesale price
export async function POST(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { numberId, customerId, resellerSalePrice, isFreeForCustomer } = body;

    if (!numberId) {
      return NextResponse.json({ error: "Number ID is required" }, { status: 400 });
    }

    const p = prisma as any;

    // Use Prisma transaction to ensure balance integrity
    const result = await p.$transaction(async (tx: any) => {
      // 1. Lock/fetch reseller record
      const reseller = await tx.reseller.findUnique({
        where: { id: session.resellerId },
      });

      if (!reseller || reseller.status !== "ACTIVE") {
        throw new Error("Reseller account is not active");
      }

      // 2. Fetch number
      const num = await tx.number.findUnique({
        where: { id: numberId },
      });

      if (!num) {
        throw new Error("Number not found");
      }

      if (num.resellerId) {
        throw new Error("Number is already owned by a reseller");
      }

      if (num.status !== "AVAILABLE") {
        throw new Error(`Number is not available for purchase (current status: ${num.status})`);
      }

      // If customerId is provided, verify customer belongs to this reseller
      let targetCustomer: any = null;
      if (customerId) {
        targetCustomer = await tx.customer.findFirst({
          where: { id: customerId, resellerId: session.resellerId },
        });
        if (!targetCustomer) {
          throw new Error("Selected customer not found under your account");
        }
      }

      // 3. Price & Discount calculation
      const retailPrice = Number(num.salePrice || 0);
      const discountPercent = Number(reseller.numberDiscountPercent || 0);
      const discountAmount = Number(((retailPrice * discountPercent) / 100).toFixed(2));
      const wholesalePrice = Number(Math.max(0, retailPrice - discountAmount).toFixed(2));

      const currentBalance = Number(reseller.balance || 0);
      if (currentBalance < wholesalePrice) {
        throw new Error(
          `Insufficient reseller balance. Required: ${wholesalePrice} BDT, Available: ${currentBalance} BDT. Please add balance.`
        );
      }

      const newBalance = Number((currentBalance - wholesalePrice).toFixed(2));

      // 4. Update Reseller balance
      await tx.reseller.update({
        where: { id: reseller.id },
        data: { balance: newBalance },
      });

      // 5. Create Reseller transaction log
      const txLog = await tx.resellerTransaction.create({
        data: {
          resellerId: reseller.id,
          type: "NUMBER_PURCHASE",
          amount: retailPrice,
          discountAmount: discountAmount,
          netAmount: wholesalePrice,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          reference: num.number,
          notes: `Wholesale purchase of ${num.number} (${discountPercent}% discount). Assigned to: ${
            targetCustomer ? targetCustomer.fullName : "Reseller Pool"
          }`,
        },
      });

      // 6. Update Number
      const isFree = Boolean(isFreeForCustomer);
      const customPrice = isFree ? 0 : (resellerSalePrice !== undefined && resellerSalePrice !== null && resellerSalePrice !== "" ? Number(resellerSalePrice) : null);

      const updatedNumber = await tx.number.update({
        where: { id: num.id },
        data: {
          resellerId: reseller.id,
          resellerPrice: wholesalePrice,
          resellerSalePrice: customPrice,
          isFreeForCustomer: isFree,
          customerId: targetCustomer ? targetCustomer.id : null,
          status: targetCustomer ? "ASSIGNED" : "AVAILABLE",
          notes: `Purchased by Reseller ${reseller.companyName} at wholesale discount`,
        },
        include: {
          customer: true,
          provider: true,
        },
      });

      // 7. Ensure Number Wallet exists if assigned to customer
      if (targetCustomer) {
        const existingWallet = await tx.numberWallet.findUnique({
          where: { numberId: num.id },
        });

        if (!existingWallet) {
          await tx.numberWallet.create({
            data: {
              numberId: num.id,
              customerId: targetCustomer.id,
              balance: 0,
              currency: "BDT",
              status: "ACTIVE",
            },
          });
        } else {
          await tx.numberWallet.update({
            where: { numberId: num.id },
            data: {
              customerId: targetCustomer.id,
              status: "ACTIVE",
            },
          });
        }
      }

      return {
        number: updatedNumber,
        newBalance,
        discountSaved: discountAmount,
        transaction: txLog,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Number ${result.number.number} purchased successfully at wholesale rate!`,
      data: result,
    });
  } catch (error: any) {
    console.error("[Reseller Numbers POST Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to purchase number" }, { status: 400 });
  }
}
