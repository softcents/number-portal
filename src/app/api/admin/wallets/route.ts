import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listWallets } from "@/lib/walletService";

// GET /api/admin/wallets
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const result = await listWallets({
      customerId: searchParams.get("customerId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("pageSize") ?? "50"),
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch wallets" }, { status: 500 });
  }
}
