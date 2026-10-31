import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/icc-balance?pin=09639700600
 *
 * Server-side proxy to the ICC talk balance API.
 * The ICC API lives at https://icctalk.com/ICC/getclientbalance.do?pin=<NUMBER>
 * and returns a plain-text float like "10.000000".
 *
 * We proxy it here to avoid browser CORS issues and to keep the ICC
 * endpoint call server-side.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pin = searchParams.get("pin");

  if (!pin || !/^\d{6,15}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid or missing pin" }, { status: 400 });
  }

  const providerParam = searchParams.get("provider");
  const isRanksitt = providerParam === "RANKSITT" || pin.startsWith("09617");
  const isIcon = providerParam === "ICON" || pin.startsWith("09644");
  const targetProvider = isRanksitt ? "RANKSITT" : isIcon ? "ICON" : "ICC";

  const p = prisma as any;

  // If RANKS ITT, route to worker balance endpoint
  if (isRanksitt) {
    const workerBase = (process.env.WORKER_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    const workerSecret =
      process.env.WORKER_SECRET || "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

    let numberRecord: any = null;
    try {
      numberRecord = await p.number.findFirst({
        where: { OR: [{ number: pin }, { normalizedNumber: pin }] },
        include: { wallet: true },
      });
    } catch (e) {
      console.warn("[ICC-Balance Proxy RANKSITT DB Warning]", e);
    }

    try {
      const res = await fetch(`${workerBase}/ranksitt-balance/${encodeURIComponent(pin)}`, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "x-worker-secret": workerSecret,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const balance = typeof data.balance === "number" ? data.balance : parseFloat(data.balance);

        if (!isNaN(balance)) {
          if (numberRecord?.wallet?.id) {
            try {
              await p.numberWallet.update({
                where: { id: numberRecord.wallet.id },
                data: { balance },
              });
            } catch (syncErr) {
              console.warn("[RANKSITT Balance Sync Warning]", syncErr);
            }
          }

          return NextResponse.json(
            {
              balance,
              pin,
              provider: "RANKSITT",
              updatedAt: data.updatedAt || new Date().toISOString(),
              cached: data.cached ?? false,
            },
            {
              headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
            }
          );
        }
      }
    } catch (err: any) {
      console.warn("[ICC-Balance Proxy RANKSITT Fetch Error]", err?.message);
    }

    // Resilient fallback: return last known value with updatedAt time
    const fallbackBalance = Number(numberRecord?.wallet?.balance ?? 0);
    const fallbackUpdatedAt =
      numberRecord?.wallet?.updatedAt instanceof Date
        ? numberRecord.wallet.updatedAt.toISOString()
        : typeof numberRecord?.wallet?.updatedAt === "string"
          ? numberRecord.wallet.updatedAt
          : new Date().toISOString();

    return NextResponse.json(
      {
        balance: fallbackBalance,
        pin,
        provider: "RANKSITT",
        updatedAt: fallbackUpdatedAt,
        fallback: true,
      },
      {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      }
    );
  }

  try {
    const targetUrl = isIcon
      ? `https://sip.italk.com.bd/iconiptsp/getclientbalance.do?pin=${encodeURIComponent(pin)}`
      : `https://icctalk.com/ICC/getclientbalance.do?pin=${encodeURIComponent(pin)}`;

    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "text/plain, */*" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `${targetProvider} API returned ${res.status}` },
        { status: 502 }
      );
    }

    const text = (await res.text()).trim();
    const balance = parseFloat(text);

    if (isNaN(balance)) {
      return NextResponse.json({ error: `Unexpected ${targetProvider} API response`, raw: text }, { status: 502 });
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
      console.warn("[ICC Balance Sync Warning]", syncErr);
    }

    return NextResponse.json(
      { balance, pin },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("[ICC Balance Proxy Error]", err?.message);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch ICC balance" },
      { status: 502 }
    );
  }
}
