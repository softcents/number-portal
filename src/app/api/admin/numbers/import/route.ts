import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeNumber } from "@/lib/numberService";

// POST /api/admin/numbers/import — parse CSV and create import session with preview
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rows, filename } = body; // rows: array of raw number strings
    const adminToken = req.cookies.get("admin_token")?.value ?? "system";
    const p = prisma as any;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    if (rows.length > 5000) {
      return NextResponse.json({ error: "Max 5000 numbers per import" }, { status: 400 });
    }

    // Create import session
    const importSession = await p.numberImport.create({
      data: {
        filename: filename ?? "manual_import.csv",
        totalRows: rows.length,
        status: "PREVIEW",
        importedBy: adminToken,
      },
    });

    // Validate each row
    const rowResults: any[] = [];
    let valid = 0, duplicate = 0, invalid = 0;

    for (let i = 0; i < rows.length; i++) {
      const raw = String(rows[i]).trim();
      const normalized = normalizeNumber(raw);

      // Check if valid BD number (13 digits starting with 880)
      const isValidFormat = /^880\d{10}$/.test(normalized);

      if (!isValidFormat) {
        rowResults.push({
          importId: importSession.id, rowNumber: i + 1,
          rawData: { raw }, normalizedNumber: normalized,
          status: "INVALID", errorMessage: "Invalid number format",
        });
        invalid++;
        continue;
      }

      // Check duplicate in DB
      const exists = await p.number.findFirst({ where: { normalizedNumber: normalized } });
      if (exists) {
        rowResults.push({
          importId: importSession.id, rowNumber: i + 1,
          rawData: { raw }, normalizedNumber: normalized,
          status: "DUPLICATE", errorMessage: "Number already exists",
        });
        duplicate++;
        continue;
      }

      rowResults.push({
        importId: importSession.id, rowNumber: i + 1,
        rawData: { raw }, normalizedNumber: normalized,
        status: "VALID",
      });
      valid++;
    }

    // Insert all rows
    await p.numberImportRow.createMany({ data: rowResults });

    // Update import summary
    await p.numberImport.update({
      where: { id: importSession.id },
      data: { validRows: valid, duplicateRows: duplicate, invalidRows: invalid },
    });

    return NextResponse.json({
      importId: importSession.id,
      totalRows: rows.length,
      validRows: valid,
      duplicateRows: duplicate,
      invalidRows: invalid,
      preview: rowResults.slice(0, 20), // first 20 for UI preview
    });
  } catch (error: any) {
    console.error("[Import POST]", error);
    return NextResponse.json({ error: error?.message ?? "Import failed" }, { status: 500 });
  }
}
