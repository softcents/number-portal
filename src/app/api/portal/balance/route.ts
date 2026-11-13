import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/centralAuth";
import { getCustomerBalanceInfo } from "@/lib/customerBalanceService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getClientSession(req);
    if (!session || !session.customerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const balanceInfo = await getCustomerBalanceInfo(session.customerId);
    return NextResponse.json(balanceInfo);
  } catch (error: any) {
    console.error("[Customer Balance API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load balance" },
      { status: 500 }
    );
  }
}
