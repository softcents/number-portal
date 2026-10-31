import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/numberService";

// GET /api/admin/providers
export async function GET() {
  try {
    const p = prisma as any;

    // Ensure baseline providers exist (ICC, ICON, RANKSITT)
    try {
      const DEFAULT_PROVIDERS = [
        {
          code: "ICC",
          name: "ICC Admin Panel",
          loginUrl: "https://iccfios.net/icc-form/index.php/admin/login",
          notes: "ICC provider — auto-login httpx session via Python worker",
        },
        {
          code: "ICON",
          name: "ICON Infotech Admin",
          loginUrl: "http://iptspkyc.icon-infotech.net:81/login/",
          notes: "ICON provider — short code 09644",
        },
        {
          code: "RANKSITT",
          name: "Ranksitt Admin Panel",
          loginUrl: "",
          notes: "Ranksitt provider — short code 09617",
        },
      ];

      for (const dp of DEFAULT_PROVIDERS) {
        const existing = await p.provider.findFirst({
          where: {
            OR: [
              { code: dp.code },
              ...(dp.code === "RANKSITT" ? [{ code: "RANKS" }] : []),
            ],
          },
        });
        if (!existing) {
          await p.provider.create({
            data: {
              code: dp.code,
              name: dp.name,
              loginUrl: dp.loginUrl,
              isActive: true,
              notes: dp.notes,
            },
          });
        } else if (dp.code === "RANKSITT" && (existing.code !== "RANKSITT" || existing.name !== dp.name)) {
          await p.provider.update({
            where: { id: existing.id },
            data: { code: "RANKSITT", name: dp.name },
          });
        }
      }
    } catch {
      // Non-fatal if concurrent write occurs
    }

    const providers = await p.provider.findMany({
      include: {
        credential: true,
        _count: { select: { numbers: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const formatted = providers.map((prov: any) => {
      let password = "";
      let rechargePassword = "";

      if (prov.credential?.encryptedPassword) {
        try {
          password = Buffer.from(prov.credential.encryptedPassword, "base64").toString("utf-8");
        } catch {
          password = "";
        }
      }

      if (prov.credential?.rechargeEncryptedPassword) {
        try {
          rechargePassword = Buffer.from(prov.credential.rechargeEncryptedPassword, "base64").toString("utf-8");
        } catch {
          rechargePassword = "";
        }
      }

      return {
        ...prov,
        credential: prov.credential
          ? {
              id: prov.credential.id,
              username: prov.credential.username || "",
              password,
              rechargeUsername: prov.credential.rechargeUsername || "",
              rechargePassword,
              createdAt: prov.credential.createdAt,
              updatedAt: prov.credential.updatedAt,
            }
          : null,
      };
    });

    return NextResponse.json(formatted);
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
  }
}

// POST /api/admin/providers — create provider
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      code,
      name,
      loginUrl,
      rechargeLoginUrl,
      notes,
      username,
      password,
      rechargeUsername,
      rechargePassword,
    } = body;
    const p = prisma as any;

    if (!code?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "Code and name are required" }, { status: 400 });
    }

    const upperCode = code.trim().toUpperCase();
    const existing = await p.provider.findUnique({ where: { code: upperCode } });
    if (existing) {
      return NextResponse.json({ error: `Provider code ${code} already exists` }, { status: 400 });
    }

    const provider = await p.provider.create({
      data: {
        code: upperCode,
        name: name.trim(),
        loginUrl: loginUrl?.trim() || null,
        rechargeLoginUrl: rechargeLoginUrl?.trim() || null,
        notes: notes?.trim() || null,
        isActive: true,
      },
    });

    // Store credentials if provided
    if (username || password || rechargeUsername || rechargePassword) {
      const encryptedPassword = password ? Buffer.from(password).toString("base64") : "";
      const rechargeEncryptedPassword = rechargePassword ? Buffer.from(rechargePassword).toString("base64") : null;

      await p.providerCredential.create({
        data: {
          providerId: provider.id,
          username: (username || "").trim(),
          encryptedPassword,
          rechargeUsername: (rechargeUsername || "").trim() || null,
          rechargeEncryptedPassword,
        },
      });
    }

    // Sync to Python worker if configured
    syncToWorker(upperCode, {
      kyc: { loginUrl: provider.loginUrl, username, password },
      recharge: { loginUrl: provider.rechargeLoginUrl, username: rechargeUsername, password: rechargePassword },
    }).catch(() => {});

    const adminToken = req.cookies.get("admin_token")?.value ?? "system";
    await writeAuditLog({
      actorType: "admin",
      actorId: adminToken,
      action: "CREATE",
      resource: "provider",
      resourceId: provider.id,
      newValue: { code: provider.code, name: provider.name },
      source: "admin_manual",
    });

    return NextResponse.json(provider, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to create provider" }, { status: 400 });
  }
}

async function syncToWorker(provider: string, data: { kyc?: any; recharge?: any }) {
  const workerUrl = process.env.WORKER_URL || "http://127.0.0.1:8001";
  const workerSecret =
    process.env.WORKER_SECRET ||
    "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

  try {
    await fetch(`${workerUrl}/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": workerSecret,
      },
      body: JSON.stringify({
        provider,
        kyc: data.kyc,
        recharge: data.recharge,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err: any) {
    console.warn("[syncToWorker] Worker not reachable for immediate credentials update:", err?.message);
  }
}
