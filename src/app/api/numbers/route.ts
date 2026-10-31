import { NextRequest, NextResponse } from "next/server";
import { getNumbers } from "@/lib/numberService";

/**
 * GET /api/numbers
 * Public route: returns available numbers for the customer portal catalog.
 * Accepts optional query params: status, limit, page, search, providerId
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status") ?? "AVAILABLE";
    const limit = Number(searchParams.get("limit") ?? "100");
    const page = Number(searchParams.get("page") ?? "1");
    const query = searchParams.get("search") ?? undefined;
    const providerId = searchParams.get("providerId") ?? undefined;

    const result = await getNumbers({
      status: status === "ALL" ? undefined : status,
      providerId,
      query,
      page,
      pageSize: limit,
    });

    // Return shape the customer portal store expects: { numbers: [...] }
    return NextResponse.json({
      numbers: result.rows,
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
