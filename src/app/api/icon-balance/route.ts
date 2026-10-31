import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/icon-balance?pin=09644000111
 *
 * Server-side proxy to the ICON provider balance API.
 * The ICON API lives at https://sip.italk.com.bd/iconiptsp/getclientbalance.do?pin=<NUMBER>
 * and returns a plain-text float like "9273.725003".
 *
 * We proxy it here to avoid browser CORS issues and keep the external
 * endpoint call server-side.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pin = searchParams.get("pin");

  if (!pin || !/^\d{6,15}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid or missing pin" }, { status: 400 });
  }

  try {
    const iconUrl = `https://sip.italk.com.bd/iconiptsp/getclientbalance.do?pin=${encodeURIComponent(pin)}`;
    const res = await fetch(iconUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "text/plain, */*" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `ICON API returned ${res.status}` },
        { status: 502 }
      );
    }

    const text = (await res.text()).trim();
    const balance = parseFloat(text);

    if (isNaN(balance)) {
      return NextResponse.json({ error: "Unexpected ICON API response", raw: text }, { status: 502 });
    }

    // Best-effort: sync live balance to DB wallet so both live API and DB stay aligned
    try {
      const p = prisma as any;
      const numberRecord = await p.number.findFirst({
        where: {
          OR: [{ number: pin }, { normalizedNumber: pin }],
        },
        include: { wallet: true },
      });

      if (numberRecord?.wallet?.id) {
        await p.numberWallet.update({
          where: { id: numberRecord.wallet.id },
          data: { balance },
        });
      }
    } catch (syncErr) {
      // Non-fatal, live balance response is still returned
      console.warn("[ICON Balance Sync Warning]", syncErr);
    }

    return NextResponse.json(
      { balance, pin, provider: "ICON" },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("[ICON Balance Proxy Error]", err?.message);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch ICON balance" },
      { status: 502 }
    );
  }
}
