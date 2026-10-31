import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_DISPLAY_COMPANIES = [
  { code: "09639", name: "09639" },
  { code: "09644", name: "09644" },
  { code: "09617", name: "09617" },
];

// GET /api/admin/display-companies
export async function GET() {
  try {
    const p = prisma as any;

    // Ensure baseline IPTSP display companies & providers exist, and sync short codes
    try {
      // Ensure RANKSITT provider exists
      const existingRanks = await p.provider.findFirst({
        where: { OR: [{ code: "RANKSITT" }, { code: "RANKS" }] },
      });
      if (!existingRanks) {
        await p.provider.create({
          data: {
            code: "RANKSITT",
            name: "Ranksitt Admin Panel",
            loginUrl: "",
            isActive: true,
            notes: "Ranksitt provider — short code 09617",
          },
        });
      } else if (existingRanks.code !== "RANKSITT" || existingRanks.name !== "Ranksitt Admin Panel") {
        await p.provider.update({
          where: { id: existingRanks.id },
          data: { code: "RANKSITT", name: "Ranksitt Admin Panel" },
        });
      }

      // Upsert the three allowed display companies with clean code-only names
      for (const dc of DEFAULT_DISPLAY_COMPANIES) {
        await p.displayCompany.upsert({
          where: { code: dc.code },
          update: { name: dc.name, isActive: true },
          create: { code: dc.code, name: dc.name, isActive: true },
        });
      }

      // Deactivate any legacy display codes (like 09678, 09696)
      await p.displayCompany.updateMany({
        where: { code: { notIn: DEFAULT_DISPLAY_COMPANIES.map((d) => d.code) } },
        data: { isActive: false },
      });

      // Sync existing numbers in DB to the correct provider & display company
      const [iccProv, iconProv, ranksProv] = await Promise.all([
        p.provider.findUnique({ where: { code: "ICC" }, select: { id: true } }),
        p.provider.findUnique({ where: { code: "ICON" }, select: { id: true } }),
        p.provider.findFirst({ where: { OR: [{ code: "RANKSITT" }, { code: "RANKS" }] }, select: { id: true } }),
      ]);
      const [dc09639, dc09644, dc09617] = await Promise.all([
        p.displayCompany.findUnique({ where: { code: "09639" }, select: { id: true } }),
        p.displayCompany.findUnique({ where: { code: "09644" }, select: { id: true } }),
        p.displayCompany.findUnique({ where: { code: "09617" }, select: { id: true } }),
      ]);

      if (ranksProv && dc09617) {
        await p.number.updateMany({
          where: {
            OR: [
              { number: { startsWith: "09617" } },
              { normalizedNumber: { startsWith: "8809617" } },
              { normalizedNumber: { startsWith: "09617" } },
            ],
          },
          data: { providerId: ranksProv.id, displayCompanyId: dc09617.id },
        });
      }

      if (iconProv && dc09644) {
        await p.number.updateMany({
          where: {
            OR: [
              { number: { startsWith: "09644" } },
              { normalizedNumber: { startsWith: "8809644" } },
              { normalizedNumber: { startsWith: "09644" } },
            ],
          },
          data: { providerId: iconProv.id, displayCompanyId: dc09644.id },
        });
      }

      if (iccProv && dc09639) {
        await p.number.updateMany({
          where: {
            OR: [
              { number: { startsWith: "09639" } },
              { normalizedNumber: { startsWith: "8809639" } },
              { normalizedNumber: { startsWith: "09639" } },
            ],
          },
          data: { providerId: iccProv.id, displayCompanyId: dc09639.id },
        });
      }
    } catch {
      // Non-fatal if concurrent write occurs
    }

    const companies = await p.displayCompany.findMany({
      where: { isActive: true },
      include: { _count: { select: { numbers: true } } },
      orderBy: { code: "asc" },
    });
    return NextResponse.json(companies);
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch display companies" }, { status: 500 });
  }
}

// POST /api/admin/display-companies
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, name } = body;
    const p = prisma as any;

    if (!code?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "Code and name are required" }, { status: 400 });
    }

    const company = await p.displayCompany.create({
      data: { code: code.trim().toUpperCase(), name: name.trim(), isActive: true },
    });
    return NextResponse.json(company, { status: 201 });
  } catch (error: any) {
    const msg = error?.code === "P2002" ? "Company code already exists" : (error?.message ?? "Failed to create");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
