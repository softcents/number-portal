import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { changeNumberStatus, writeAuditLog } from "@/lib/numberService";

// GET /api/admin/numbers/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const p = prisma as any;
    const num = await p.number.findUnique({
      where: { id },
      include: {
        provider: true,
        displayCompany: true,
        customer: true,
        wallet: true,
        statusHistory: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!num) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(num);
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch number" }, { status: 500 });
  }
}

// PATCH /api/admin/numbers/[id] — update fields or status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const p = prisma as any;
    const adminToken = req.cookies.get("admin_token")?.value ?? "system";

    const existing = await p.number.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Status change is handled separately through status service
    if (body.status && body.status !== existing.status) {
      const result = await changeNumberStatus({
        numberId: id,
        toStatus: body.status,
        changedBy: adminToken,
        reason: body.reason ?? "Admin manual update",
        source: "admin_manual",
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      });
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    }

    // Update other fields
    const updateData: any = {};
    const allowedFields = [
      "city",
      "area",
      "numberType",
      "callRate",
      "costPrice",
      "salePrice",
      "providerId",
      "providerReferenceId",
      "displayCompanyId",
      "notes",
      "activationStatus",
      "country",
      "countryCode",
    ];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field] === "" ? null : body[field];
      }
    }

    if (Object.keys(updateData).length > 0) {
      await p.number.update({ where: { id }, data: updateData });
    }

    await writeAuditLog({
      actorType: "admin",
      actorId: adminToken,
      action: "UPDATE",
      resource: "number",
      resourceId: id,
      oldValue: existing,
      newValue: { ...updateData, status: body.status ?? existing.status },
      reason: body.reason,
      source: "admin_manual",
    });

    const updated = await p.number.findUnique({
      where: { id },
      include: { provider: true, displayCompany: true, customer: true },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("[Admin Numbers PATCH]", error);
    return NextResponse.json({ error: error?.message ?? "Failed to update" }, { status: 500 });
  }
}

// DELETE /api/admin/numbers/[id] — allow admin to delete any number
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const p = prisma as any;
    const adminToken = req.cookies.get("admin_token")?.value ?? "system";

    const num = await p.number.findUnique({ where: { id } });
    if (!num) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await p.$transaction(async (tx: any) => {
      const wallets = await tx.numberWallet.findMany({ where: { numberId: id }, select: { id: true } });
      const walletIds = wallets.map((w: any) => w.id);
      if (walletIds.length > 0) {
        await tx.numberWalletTransaction.deleteMany({ where: { walletId: { in: walletIds } } });
      }
      await tx.numberWallet.deleteMany({ where: { numberId: id } });
      await tx.orderItem.deleteMany({ where: { numberId: id } });
      await tx.rechargeTransaction.deleteMany({ where: { numberId: id } });
      await tx.rechargeOrder.deleteMany({ where: { numberId: id } });
      await tx.numberImportRow.updateMany({ where: { numberId: id }, data: { numberId: null } });
      await tx.numberStatusHistory.deleteMany({ where: { numberId: id } });
      await tx.number.delete({ where: { id } });
    });

    await writeAuditLog({
      actorType: "admin",
      actorId: adminToken,
      action: "DELETE",
      resource: "number",
      resourceId: id,
      oldValue: { number: num.number, status: num.status },
      reason: "Admin deleted number",
      source: "admin_manual",
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Numbers DELETE]", error);
    return NextResponse.json({ error: error?.message || "Failed to delete number" }, { status: 500 });
  }
}
