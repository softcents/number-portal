import { NextResponse } from "next/server";
import { getAdminDashboardStats } from "@/lib/adminAudit";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const p = prisma as any;

    // Existing verification stats
    const baseStats = await getAdminDashboardStats();

    // Number Sale stats (all safe — returns 0 if tables don't exist)
    let numberSaleStats = {
      totalNumbers: 0,
      availableNumbers: 0,
      activeNumbers: 0,
      reservedNumbers: 0,
      blockedNumbers: 0,
      totalCustomers: 0,
      activeCustomers: 0,
      totalProviders: 0,
      activeProviders: 0,
      totalWallets: 0,
      totalOrders: 0,
      pendingOrders: 0,
      completedOrders: 0,
    };

    try {
      const [
        totalNumbers, availableNumbers, activeNumbers, reservedNumbers, blockedNumbers,
        totalCustomers, activeCustomers,
        totalProviders, activeProviders,
        totalWallets,
        totalOrders, pendingOrders, completedOrders,
      ] = await Promise.all([
        p.number.count(),
        p.number.count({ where: { status: "AVAILABLE" } }),
        p.number.count({ where: { status: "ACTIVE" } }),
        p.number.count({ where: { status: "RESERVED" } }),
        p.number.count({ where: { status: "BLOCKED" } }),
        p.customer.count(),
        p.customer.count({ where: { isActive: true } }),
        p.provider.count(),
        p.provider.count({ where: { isActive: true } }),
        p.numberWallet.count(),
        p.order.count(),
        p.order.count({ where: { status: { in: ["PENDING_PAYMENT", "PAYMENT_PROCESSING", "PAID", "PROCESSING"] } } }),
        p.order.count({ where: { status: "COMPLETED" } }),
      ]);

      numberSaleStats = {
        totalNumbers, availableNumbers, activeNumbers, reservedNumbers, blockedNumbers,
        totalCustomers, activeCustomers,
        totalProviders, activeProviders,
        totalWallets,
        totalOrders, pendingOrders, completedOrders,
      };
    } catch {
      // Tables may not exist yet — silently continue
    }

    return NextResponse.json({ ...baseStats, numberSale: numberSaleStats });
  } catch (error: any) {
    console.error("[Admin Stats Error]:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin stats", detail: error?.message },
      { status: 500 }
    );
  }
}
