import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    let apiKey = body.apiKey?.trim();
    const baseUrl = (body.baseUrl?.trim() || "https://epay.softcents.com/api").replace(/\/$/, "");

    const p = prisma as any;

    // If apiKey is masked or empty, read from saved DB
    if (!apiKey || apiKey.startsWith("•••")) {
      const reseller = await p.reseller.findUnique({
        where: { id: session.resellerId },
        select: { pgApiKey: true },
      });
      apiKey = reseller?.pgApiKey;
    }

    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: "Please provide or save an API key first." },
        { status: 400 }
      );
    }

    // Ping PipraPay / epay with test request
    try {
      const res = await fetch(`${baseUrl}/verify-payment`, {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "MHS-PIPRAPAY-API-KEY": apiKey,
          "mh-piprapay-api-key": apiKey,
        },
        body: JSON.stringify({ pp_id: "TEST_PING" }),
        signal: AbortSignal.timeout(8000),
      });

      const resText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(resText);
      } catch {}

      // If status is 401 or 403, invalid API key
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json({
          success: false,
          status: res.status,
          message: "API Key rejected by gateway: Authentication failed (401/403 Unauthorized).",
        });
      }

      // Any other response (like "not found" or 200/404/422) means the API key is recognized and valid
      return NextResponse.json({
        success: true,
        status: res.status,
        message: "Connection successful! Gateway credentials verified.",
      });
    } catch (fetchErr: any) {
      return NextResponse.json({
        success: false,
        message: `Connection failed: ${fetchErr?.message || "Network timeout connecting to gateway"}`,
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to test gateway connection" },
      { status: 500 }
    );
  }
}
