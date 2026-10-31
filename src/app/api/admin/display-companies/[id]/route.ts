import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/admin/display-companies/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const p = prisma as any;
    const updated = await p.displayCompany.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to update" }, { status: 500 });
  }
}

// DELETE /api/admin/display-companies/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const p = prisma as any;
    const count = await p.number.count({ where: { displayCompanyId: id } });
    if (count > 0) {
      return NextResponse.json({ error: `Cannot delete: ${count} numbers use this display code` }, { status: 400 });
    }
    await p.displayCompany.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
