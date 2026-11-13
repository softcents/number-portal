import { NextRequest, NextResponse } from "next/server";
import { getResellerSession } from "@/lib/resellerAuth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET /api/reseller/settings
export async function GET(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const p = prisma as any;
    const reseller = await p.reseller.findUnique({
      where: { id: session.resellerId },
    });

    if (!reseller) {
      return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      reseller: {
        id: reseller.id,
        username: reseller.username,
        email: reseller.email,
        companyName: reseller.companyName,
        brandName: reseller.brandName,
        logoUrl: reseller.logoUrl,
        subdomain: reseller.subdomain,
        customDomain: reseller.customDomain,
        brandColor: reseller.brandColor || "#2563eb",
        supportEmail: reseller.supportEmail,
        supportPhone: reseller.supportPhone,
        balance: Number(reseller.balance || 0),
        currency: reseller.currency,
        numberDiscountPercent: Number(reseller.numberDiscountPercent || 0),
        rechargeDiscountPercent: Number(reseller.rechargeDiscountPercent || 0),
        status: reseller.status,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}

// PUT /api/reseller/settings
export async function PUT(req: NextRequest) {
  try {
    const session = await getResellerSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      companyName,
      brandName,
      logoUrl,
      brandColor,
      subdomain,
      customDomain,
      supportEmail,
      supportPhone,
      currentPassword,
      newPassword,
    } = body;

    const p = prisma as any;
    const existing = await p.reseller.findUnique({
      where: { id: session.resellerId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (companyName) updateData.companyName = companyName.trim();
    if (brandName) updateData.brandName = brandName.trim();
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl?.trim() || null;
    if (brandColor !== undefined) updateData.brandColor = brandColor?.trim() || "#2563eb";
    if (supportEmail !== undefined) updateData.supportEmail = supportEmail?.trim() || null;
    if (supportPhone !== undefined) updateData.supportPhone = supportPhone?.trim() || null;

    // Check subdomain uniqueness if changing
    if (subdomain !== undefined) {
      const cleanSub = subdomain ? subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") : null;
      if (cleanSub && cleanSub !== existing.subdomain) {
        const dupSub = await p.reseller.findUnique({ where: { subdomain: cleanSub } });
        if (dupSub) {
          return NextResponse.json({ error: "Subdomain is already taken" }, { status: 400 });
        }
      }
      updateData.subdomain = cleanSub;
    }

    // Check custom domain uniqueness if changing
    if (customDomain !== undefined) {
      const cleanDomain = customDomain ? customDomain.trim().toLowerCase() : null;
      if (cleanDomain && cleanDomain !== existing.customDomain) {
        const dupDomain = await p.reseller.findUnique({ where: { customDomain: cleanDomain } });
        if (dupDomain) {
          return NextResponse.json({ error: "Custom domain is already linked to another reseller" }, { status: 400 });
        }
      }
      updateData.customDomain = cleanDomain;
    }

    // Password change
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password required to change password" }, { status: 400 });
      }
      const match = await bcrypt.compare(currentPassword, existing.passwordHash);
      if (!match) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
      updateData.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updated = await p.reseller.update({
      where: { id: session.resellerId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "Branding and profile settings saved successfully",
      reseller: {
        id: updated.id,
        companyName: updated.companyName,
        brandName: updated.brandName,
        logoUrl: updated.logoUrl,
        brandColor: updated.brandColor,
        subdomain: updated.subdomain,
        customDomain: updated.customDomain,
        supportEmail: updated.supportEmail,
        supportPhone: updated.supportPhone,
      },
    });
  } catch (error: any) {
    console.error("[Reseller Settings PUT Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to save settings" }, { status: 500 });
  }
}
