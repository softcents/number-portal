import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNumber, getNumbers, writeAuditLog } from "@/lib/numberService";

// GET /api/admin/numbers — list with filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const result = await getNumbers({
      status: searchParams.get("status") ?? undefined,
      providerId: searchParams.get("providerId") ?? undefined,
      query: searchParams.get("q") ?? undefined,
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("pageSize") ?? "50"),
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Admin Numbers GET]", error);
    return NextResponse.json({ error: "Failed to fetch numbers" }, { status: 500 });
  }
}

// POST /api/admin/numbers — create single number
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { number, country, countryCode, city, area, numberType, callRate, costPrice,
            salePrice, providerId, providerReferenceId, displayCompanyId, notes } = body;

    if (!number?.trim()) {
      return NextResponse.json({ error: "Number is required" }, { status: 400 });
    }

    const adminToken = req.cookies.get("admin_token")?.value ?? "system";

    const created = await createNumber({
      number: number.trim(),
      country, countryCode, city, area, numberType,
      callRate: callRate ? Number(callRate) : undefined,
      costPrice: costPrice ? Number(costPrice) : undefined,
      salePrice: salePrice ? Number(salePrice) : undefined,
      providerId: providerId || undefined,
      providerReferenceId: providerReferenceId || undefined,
      displayCompanyId: displayCompanyId || undefined,
      notes,
      adminId: adminToken,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("[Admin Numbers POST]", error);
    const msg = error?.message ?? "Failed to create number";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
