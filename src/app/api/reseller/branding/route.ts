import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/reseller/branding?resellerId=... or ?subdomain=... or ?host=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const resellerId = searchParams.get("resellerId");
    const subdomain = searchParams.get("subdomain");
    const host = searchParams.get("host") || req.headers.get("host") || "";

    const p = prisma as any;
    let reseller = null;

    if (resellerId) {
      reseller = await p.reseller.findUnique({
        where: { id: resellerId },
      });
    } else if (subdomain) {
      reseller = await p.reseller.findUnique({
        where: { subdomain: subdomain.toLowerCase() },
      });
    } else if (host) {
      // Check if customDomain matches host
      const cleanHost = host.split(":")[0].toLowerCase();
      reseller = await p.reseller.findFirst({
        where: {
          OR: [
            { customDomain: cleanHost },
            { subdomain: cleanHost.split(".")[0] },
          ],
        },
      });
    }

    if (!reseller || reseller.status !== "ACTIVE") {
      return NextResponse.json({
        isResellerBranded: false,
        brandName: "Data Verification & Number Sale Portal",
        companyName: "Softcents",
        brandColor: "#0284c7",
        logoUrl: null,
      });
    }

    return NextResponse.json({
      isResellerBranded: true,
      resellerId: reseller.id,
      brandName: reseller.brandName || reseller.companyName,
      companyName: reseller.companyName,
      logoUrl: reseller.logoUrl,
      brandColor: reseller.brandColor || "#2563eb",
      supportEmail: reseller.supportEmail,
      supportPhone: reseller.supportPhone,
    });
  } catch (error: any) {
    return NextResponse.json({ isResellerBranded: false }, { status: 200 });
  }
}
