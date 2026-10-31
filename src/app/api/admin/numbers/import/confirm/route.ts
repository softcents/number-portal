import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/admin/numbers/import/confirm — commit valid rows from an import session
export async function POST(req: NextRequest) {
  try {
    const { importId, providerId, displayCompanyId, numberType, costPrice, salePrice } = await req.json();
    const adminToken = req.cookies.get("admin_token")?.value ?? "system";
    const p = prisma as any;

    if (!importId) return NextResponse.json({ error: "importId required" }, { status: 400 });

    const session = await p.numberImport.findUnique({
      where: { id: importId },
      include: { rows: { where: { status: "VALID" } } },
    });

    if (!session) return NextResponse.json({ error: "Import session not found" }, { status: 404 });
    if (session.status !== "PREVIEW") return NextResponse.json({ error: "Import already processed" }, { status: 400 });

    await p.numberImport.update({ where: { id: importId }, data: { status: "IMPORTING" } });

    let imported = 0;
    for (const row of session.rows) {
      try {
        let rowProviderId = providerId || null;
        let rowDisplayCompanyId = displayCompanyId || null;

        if (!rowDisplayCompanyId || !rowProviderId) {
          const clean = (row.normalizedNumber || "").replace(/^880/, "0");
          const m = clean.match(/^(096\d{2})/);
          if (m) {
            const prefix = m[1];
            if (!rowDisplayCompanyId) {
              const dc = await p.displayCompany.findUnique({ where: { code: prefix } });
              if (dc) rowDisplayCompanyId = dc.id;
            }
            if (!rowProviderId) {
              const pCode = prefix === "09644" ? "ICON" : (prefix === "09617" ? "RANKSITT" : (prefix === "09639" ? "ICC" : null));
              if (pCode) {
                const prov = await p.provider.findFirst({
                  where: {
                    OR: [
                      { code: pCode },
                      ...(pCode === "RANKSITT" ? [{ code: "RANKS" }] : []),
                    ],
                  },
                });
                if (prov) rowProviderId = prov.id;
              }
            }
          }
        }

        await p.number.create({
          data: {
            number: row.rawData?.raw ?? row.normalizedNumber,
            normalizedNumber: row.normalizedNumber,
            numberType: numberType ?? "MOBILE",
            country: "BD",
            countryCode: "+880",
            providerId: rowProviderId,
            displayCompanyId: rowDisplayCompanyId,
            costPrice: costPrice ? Number(costPrice) : null,
            salePrice: salePrice ? Number(salePrice) : null,
            status: "AVAILABLE",
          },
        });
        await p.numberImportRow.update({ where: { id: row.id }, data: { status: "IMPORTED" } });
        await p.numberStatusHistory.create({
          data: {
            numberId: (await p.number.findFirst({ where: { normalizedNumber: row.normalizedNumber } }))?.id ?? "",
            fromStatus: null,
            toStatus: "AVAILABLE",
            changedBy: adminToken,
            reason: `Bulk import: ${session.filename}`,
            source: "admin_manual",
          },
        });
        imported++;
      } catch {
        await p.numberImportRow.update({
          where: { id: row.id },
          data: { status: "INVALID", errorMessage: "DB insert failed" },
        });
      }
    }

    await p.numberImport.update({
      where: { id: importId },
      data: { status: "COMPLETED", importedRows: imported },
    });

    return NextResponse.json({ success: true, imported, total: session.rows.length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Confirm failed" }, { status: 500 });
  }
}
