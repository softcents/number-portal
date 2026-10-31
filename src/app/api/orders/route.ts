import { NextRequest, NextResponse } from "next/server";
import { createOrder, getOrders, expireStaleOrders } from "@/lib/orderService";

// GET /api/orders — list orders
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const customerId = searchParams.get("customerId") || undefined;
    const search = searchParams.get("search") || undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    // Opportunistically run expiry check
    expireStaleOrders().catch((e) => console.error("Error expiring stale orders:", e));

    const result = await getOrders({
      status,
      customerId,
      search,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

// POST /api/orders — create new order with number reservations
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerId, numberIds, notes, reservationMinutes } = body;

    if (!customerId || !numberIds || !Array.isArray(numberIds) || numberIds.length === 0) {
      return NextResponse.json(
        { error: "customerId and a non-empty array of numberIds are required" },
        { status: 400 }
      );
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";

    const result = await createOrder({
      customerId,
      numberIds,
      notes,
      reservationMinutes: reservationMinutes ? parseInt(reservationMinutes) : 15,
      actorId: customerId,
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      order: result.order,
      numbersCount: result.numbersCount,
      expiresAt: result.expiresAt,
    }, { status: 201 });
  } catch (error: any) {
    console.error("[Create Order API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create order" },
      { status: 400 }
    );
  }
}
