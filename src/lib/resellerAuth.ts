import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const RESELLER_AUTH_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  process.env.CENTRAL_AUTH_SECRET ||
  "reseller-auth-portal-secret-key-2026";

export interface ResellerSession {
  resellerId: string;
  username: string;
  email: string;
  companyName: string;
  brandName: string;
  logoUrl?: string | null;
  subdomain?: string | null;
  customDomain?: string | null;
  brandColor?: string | null;
  status: string;
  numberDiscountPercent: number;
  rechargeDiscountPercent: number;
  balance: number;
  currency: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
}

export function signResellerToken(payload: any, expiresInSeconds = 86400 * 7): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", RESELLER_AUTH_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyResellerToken(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", RESELLER_AUTH_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

export async function authenticateReseller(params: {
  usernameOrEmail: string;
  password: string;
}): Promise<{ success: boolean; session?: ResellerSession; token?: string; error?: string }> {
  const { usernameOrEmail, password } = params;
  const cleanInput = usernameOrEmail.trim().toLowerCase();
  const p = prisma as any;

  if (!cleanInput || !password) {
    return { success: false, error: "Username/Email and password are required" };
  }

  const reseller = await p.reseller.findFirst({
    where: {
      OR: [
        { username: cleanInput },
        { email: cleanInput },
      ],
    },
  });

  if (!reseller) {
    return { success: false, error: "Invalid username or password" };
  }

  if (reseller.status !== "ACTIVE") {
    return {
      success: false,
      error: `Your reseller account is currently ${reseller.status.toLowerCase()}. Please contact admin.`,
    };
  }

  const isValidPassword = await bcrypt.compare(password, reseller.passwordHash);
  if (!isValidPassword) {
    return { success: false, error: "Invalid username or password" };
  }

  const session: ResellerSession = {
    resellerId: reseller.id,
    username: reseller.username,
    email: reseller.email,
    companyName: reseller.companyName,
    brandName: reseller.brandName,
    logoUrl: reseller.logoUrl,
    subdomain: reseller.subdomain,
    customDomain: reseller.customDomain,
    brandColor: reseller.brandColor || "#2563eb",
    status: reseller.status,
    numberDiscountPercent: Number(reseller.numberDiscountPercent || 0),
    rechargeDiscountPercent: Number(reseller.rechargeDiscountPercent || 0),
    balance: Number(reseller.balance || 0),
    currency: reseller.currency || "BDT",
    supportEmail: reseller.supportEmail,
    supportPhone: reseller.supportPhone,
  };

  const token = signResellerToken(session);

  return {
    success: true,
    session,
    token,
  };
}

export async function getResellerSession(req?: NextRequest): Promise<ResellerSession | null> {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get("reseller_token")?.value;
    if (!token) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }
  } else {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get("reseller_token")?.value;
    } catch {
      // Not in server component with cookie access
    }
  }

  if (!token) return null;

  const payload = verifyResellerToken(token);
  if (!payload || !payload.resellerId) return null;

  // Fetch updated live balance and details from DB
  try {
    const p = prisma as any;
    const reseller = await p.reseller.findUnique({
      where: { id: payload.resellerId },
    });

    if (!reseller || reseller.status !== "ACTIVE") {
      return null;
    }

    return {
      resellerId: reseller.id,
      username: reseller.username,
      email: reseller.email,
      companyName: reseller.companyName,
      brandName: reseller.brandName,
      logoUrl: reseller.logoUrl,
      subdomain: reseller.subdomain,
      customDomain: reseller.customDomain,
      brandColor: reseller.brandColor || "#2563eb",
      status: reseller.status,
      numberDiscountPercent: Number(reseller.numberDiscountPercent || 0),
      rechargeDiscountPercent: Number(reseller.rechargeDiscountPercent || 0),
      balance: Number(reseller.balance || 0),
      currency: reseller.currency || "BDT",
      supportEmail: reseller.supportEmail,
      supportPhone: reseller.supportPhone,
    };
  } catch (err) {
    console.error("[getResellerSession error]:", err);
    return null;
  }
}
