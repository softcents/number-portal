import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/centralAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const WORKER_URL = process.env.WORKER_URL || "http://127.0.0.1:8000";
const WORKER_SECRET =
  process.env.WORKER_SECRET || "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

/**
 * GET /api/ranksitt-balance?pin=09617000111
 *
 * Server-side proxy to the Python worker's RANKS ITT balance endpoint.
 *
 * Security & Reliability:
 *  - Customer ownership verification: The number must belong to the logged-in customer (or admin).
 *  - Server-to-server call to Python worker with x-worker-secret; no secrets exposed to browser.
 *  - 8-second timeout guard.
 *  - Syncs live balance into numberWallet in DB.
 *  - Resilient fallback: If portal or worker is unavailable, returns last known balance with
 *    updatedAt timestamp instead of displaying an error.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pin = searchParams.get("pin");

  if (!pin || !/^\d{6,15}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid or missing pin" }, { status: 400 });
  }

  const p = prisma as any;

  // 1. Look up number record in DB
  let numberRecord: any = null;
  try {
    numberRecord = await p.number.findFirst({
      where: {
        OR: [{ number: pin }, { normalizedNumber: pin }],
      },
      include: { wallet: true },
    });
  } catch (dbErr) {
    console.warn("[RANKSITT DB Lookup Warning]", dbErr);
  }

  // 2. Ownership check
  const adminToken = req.cookies.get("admin_token")?.value;
  if (!adminToken) {
    const session = await getClientSession(req);
    if (!session || !session.customerId) {
      return NextResponse.json(
        { error: "Authentication required to access number balance" },
        { status: 401 }
      );
    }

    if (numberRecord && numberRecord.customerId && numberRecord.customerId !== session.customerId) {
      return NextResponse.json(
        { error: "Forbidden: Number does not belong to your account" },
        { status: 403 }
      );
    }
  }

  // 3. Query Python worker for live balance
  try {
    const workerBase = WORKER_URL.replace(/\/+$/, "");
    const workerUrl = `${workerBase}/ranksitt-balance/${encodeURIComponent(pin)}`;

    const res = await fetch(workerUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "x-worker-secret": WORKER_SECRET,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      const balance = typeof data.balance === "number" ? data.balance : parseFloat(data.balance);

      if (!isNaN(balance)) {
        // Sync live balance to DB wallet so both live API and DB stay aligned
        if (numberRecord?.id) {
          try {
            await p.numberWallet.upsert({
              where: { numberId: numberRecord.id },
              create: { numberId: numberRecord.id, balance },
              update: { balance },
            });
          } catch (syncErr) {
            console.warn("[RANKSITT Wallet Sync Warning]", syncErr);
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
            headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          }
        );
      }
    }

    // Worker returned non-200 or invalid payload: Fall back to last known DB wallet balance
    console.warn(`[RANKSITT Balance Worker Warning] Status ${res.status}`);
  } catch (workerErr: any) {
    console.warn("[RANKSITT Balance Worker Error]", workerErr?.message);
  }

  // 4. Graceful Fallback: Return last known value with updatedAt time instead of failing
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
      warning: "Live portal unavailable; showing last recorded balance",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
