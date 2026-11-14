import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/reseller/numbers/price
 * Allows a reseller to set their own selling price (charge) or make numbers FREE (৳0)
 * for their customers, completely independent of whatever rate the admin configured.
 *
 * Body:
 * {
 *   numberId?: string,
 *   numberIds?: string[],
 *   isFree?: boolean,
 *   customPrice?: number | string | null
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { numberId, numberIds, isFree, customPrice } = body;

    const targetIds: string[] = [];
    if (numberId) targetIds.push(numberId);
    if (Array.isArray(numberIds)) targetIds.push(...numberIds);

    if (targetIds.length === 0) {
      return NextResponse.json(
        { error: "At least one number ID must be provided" },
        { status: 400 }
      );
    }

    const p = prisma as any;

    // Verify all targeted numbers belong to this reseller
    const numbers = await p.number.findMany({
      where: {
        id: { in: targetIds },
        resellerId: session.resellerId,
      },
      select: { id: true, number: true },
    });

    if (numbers.length === 0) {
      return NextResponse.json(
        { error: "None of the specified numbers belong to your account" },
        { status: 403 }
      );
    }

    const isMarkedFree = Boolean(isFree);
    let resolvedPrice: number | null = null;

    if (isMarkedFree) {
      resolvedPrice = 0;
    } else if (customPrice !== undefined && customPrice !== null && customPrice !== "") {
      const parsed = Number(customPrice);
      if (isNaN(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: "Custom price must be a valid non-negative number" },
          { status: 400 }
        );
      }
      resolvedPrice = Number(parsed.toFixed(2));
    }

    const updateData: any = {
      isFreeForCustomer: isMarkedFree,
      resellerSalePrice: resolvedPrice,
    };

    const validIds = numbers.map((n: any) => n.id);

    await p.number.updateMany({
      where: {
        id: { in: validIds },
        resellerId: session.resellerId,
      },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: isMarkedFree
        ? `Successfully marked ${validIds.length} number(s) as FREE (৳0.00) for your customers!`
        : `Successfully set custom selling price to ৳${resolvedPrice?.toFixed(2) ?? "0.00"} for ${validIds.length} number(s)!`,
      updatedCount: validIds.length,
      isFree: isMarkedFree,
      customPrice: resolvedPrice,
    });
  } catch (error: any) {
    console.error("[Reseller Number Price Update Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update number pricing" },
      { status: 500 }
    );
  }
}
