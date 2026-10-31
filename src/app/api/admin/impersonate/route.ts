import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createImpersonationSession, getClientSession } from "@/lib/centralAuth";

// POST /api/admin/impersonate — Log in directly as customer without password
export async function POST(req: NextRequest) {
  try {
    // 1. Verify that caller is an authenticated Admin
    const adminToken = req.cookies.get("admin_token")?.value;
    if (!adminToken) {
      return NextResponse.json(
        { error: "Unauthorized: Admin session required to impersonate users" },
        { status: 401 }
      );
    }

    const p = prisma as any;
    const admin = await p.admin.findUnique({
      where: { id: adminToken },
    });

    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or expired admin credentials" },
        { status: 401 }
      );
    }

    // 2. Validate payload
    const body = await req.json();
    const { customerId } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    // 3. Generate impersonation session
    const impersonateResult = await createImpersonationSession({
      customerId,
      adminId: admin.id,
      adminUsername: admin.username,
    });

    if (!impersonateResult.success || !impersonateResult.token || !impersonateResult.session) {
      return NextResponse.json(
        { error: impersonateResult.error || "Failed to impersonate customer" },
        { status: 400 }
      );
    }

    // 4. Record security audit log in database
    try {
      await p.systemAuditLog.create({
        data: {
          actorType: "admin",
          actorId: admin.id,
          action: "IMPERSONATE_CUSTOMER",
          resource: "customer",
          resourceId: customerId,
          metadata: {
            customerEmail: impersonateResult.session.email,
            customerName: impersonateResult.session.fullName,
            adminUsername: admin.username,
            ipAddress: req.headers.get("x-forwarded-for") || "unknown",
          },
        },
      });
    } catch (auditErr) {
      console.warn("[Impersonate SystemAuditLog Warning]:", auditErr);
    }

    // 5. Response with customer session cookie and impersonation metadata cookie
    const response = NextResponse.json({
      success: true,
      message: `Impersonating ${impersonateResult.session.fullName}`,
      redirectTo: "/portal",
      user: impersonateResult.session,
    });

    // Set secure HTTP-only customer_token cookie
    response.cookies.set("customer_token", impersonateResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    // Set client-readable impersonation_session cookie for the top banner
    response.cookies.set(
      "impersonation_session",
      JSON.stringify({
        isImpersonating: true,
        customerId: impersonateResult.session.customerId,
        customerName: impersonateResult.session.fullName,
        customerEmail: impersonateResult.session.email,
        adminUsername: admin.username,
        startedAt: new Date().toISOString(),
      }),
      {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      }
    );

    return response;
  } catch (error: any) {
    console.error("[Admin Impersonate API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to initiate impersonation" },
      { status: 500 }
    );
  }
}

// GET /api/admin/impersonate — Check current impersonation status
export async function GET(req: NextRequest) {
  try {
    const adminToken = req.cookies.get("admin_token")?.value;
    const session = await getClientSession(req);

    if (session && session.isImpersonated) {
      return NextResponse.json({
        isImpersonating: true,
        adminLoggedIn: !!adminToken,
        customer: {
          id: session.customerId,
          fullName: session.fullName,
          email: session.email,
        },
        impersonatedBy: session.impersonatedBy,
      });
    }

    // Also check impersonation_session cookie as fallback
    const impCookie = req.cookies.get("impersonation_session")?.value;
    if (impCookie) {
      try {
        const parsed = JSON.parse(impCookie);
        if (parsed.isImpersonating) {
          return NextResponse.json({
            isImpersonating: true,
            adminLoggedIn: !!adminToken,
            customer: {
              id: parsed.customerId,
              fullName: parsed.customerName,
              email: parsed.customerEmail,
            },
            impersonatedBy: {
              adminUsername: parsed.adminUsername,
            },
          });
        }
      } catch {
        // ignore parse error
      }
    }

    return NextResponse.json({ isImpersonating: false });
  } catch {
    return NextResponse.json({ isImpersonating: false });
  }
}
