import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/centralAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getClientSession(req);
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const p = prisma as any;
    const customer = await p.customer.findUnique({
      where: { id: session.customerId },
      include: {
        numbers: {
          select: {
            id: true,
            number: true,
            normalizedNumber: true,
            status: true,
            displayCompany: { select: { code: true, name: true } },
            provider: { select: { code: true } },
            wallet: true,
            createdAt: true,
          },
        },
        orders: {
          take: 5,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      authenticated: true,
      user: session,
      customer,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch session" },
      { status: 500 }
    );
  }
}
