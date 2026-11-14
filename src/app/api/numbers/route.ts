import { NextRequest, NextResponse } from "next/server";
import { getNumbers } from "@/lib/numberService";
import { getClientSession } from "@/lib/centralAuth";
import { resolveCustomerNumberPrice } from "@/lib/numberPricingService";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/numbers
 * Public route: returns available numbers for the customer portal catalog.
 * Dynamically resolves prices so reseller can give numbers for FREE (৳0.00)
 * or set any custom charge to their customers, regardless of Admin's base rate.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status") ?? "AVAILABLE";
    const limit = Number(searchParams.get("limit") ?? "100");
    const page = Number(searchParams.get("page") ?? "1");
    const query = searchParams.get("search") ?? undefined;
    const providerId = searchParams.get("providerId") ?? undefined;

    const p = prisma as any;
    let resellerId = searchParams.get("resellerId") ?? undefined;

    // Check if customer is logged in and belongs to a reseller
    const session = await getClientSession(req);
    if (!resellerId && session?.customerId) {
      const cust = await p.customer.findUnique({
        where: { id: session.customerId },
        select: { resellerId: true },
      });
      if (cust?.resellerId) resellerId = cust.resellerId;
    }

    // Check host for subdomain / custom domain white-label branding
    if (!resellerId) {
      const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
      if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
        const r = await p.reseller.findFirst({
          where: {
            OR: [{ customDomain: host }, { subdomain: host.split(".")[0] }],
            status: "ACTIVE",
          },
          select: { id: true },
        });
        if (r) resellerId = r.id;
      }
    }

    const result = await getNumbers({
      status: status === "ALL" ? undefined : status,
      providerId,
      resellerId,
      query,
      page,
      pageSize: limit,
    });

    const mappedNumbers = result.rows.map((n: any) => {
      const resolved = resolveCustomerNumberPrice(n);
      return {
        ...n,
        salePrice: resolved.price,
        isFree: resolved.isFree,
        originalAdminPrice: resolved.originalSalePrice,
        isResellerCustomPrice: resolved.isCustom,
      };
    });

    return NextResponse.json({
      numbers: mappedNumbers,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      pages: result.pages,
    });
  } catch (error: any) {
    console.error("[GET /api/numbers]", error);
    return NextResponse.json(
      { error: "Failed to fetch numbers" },
      { status: 500 }
    );
  }
}
