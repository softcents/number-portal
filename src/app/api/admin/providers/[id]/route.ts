import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/numberService";

// PATCH /api/admin/providers/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const p = prisma as any;
    const adminToken = req.cookies.get("admin_token")?.value ?? "system";

    const existing = await p.provider.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const {
      name,
      loginUrl,
      rechargeLoginUrl,
      notes,
      isActive,
      username,
      password,
      rechargeUsername,
      rechargePassword,
    } = body;

    const updated = await p.provider.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(loginUrl !== undefined && { loginUrl: loginUrl?.trim() || null }),
        ...(rechargeLoginUrl !== undefined && { rechargeLoginUrl: rechargeLoginUrl?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    // Update credentials if any provided
    const credExists = await p.providerCredential.findUnique({ where: { providerId: id } });
    const encryptedPassword = password !== undefined ? Buffer.from(password).toString("base64") : undefined;
    const rechargeEncryptedPassword = rechargePassword !== undefined ? (rechargePassword ? Buffer.from(rechargePassword).toString("base64") : null) : undefined;

    let finalCred: any = null;
    if (credExists) {
      finalCred = await p.providerCredential.update({
        where: { providerId: id },
        data: {
          ...(username !== undefined && { username: (username || "").trim() }),
          ...(encryptedPassword !== undefined && { encryptedPassword }),
          ...(rechargeUsername !== undefined && { rechargeUsername: (rechargeUsername || "").trim() || null }),
          ...(rechargeEncryptedPassword !== undefined && { rechargeEncryptedPassword }),
        },
      });
    } else if (username !== undefined || password !== undefined || rechargeUsername !== undefined || rechargePassword !== undefined) {
      finalCred = await p.providerCredential.create({
        data: {
          providerId: id,
          username: (username || "").trim(),
          encryptedPassword: encryptedPassword || "",
          rechargeUsername: (rechargeUsername || "").trim() || null,
          rechargeEncryptedPassword: rechargeEncryptedPassword || null,
        },
      });
    } else {
      finalCred = credExists;
    }

    // Sync to Python worker
    let effectiveKycPass = "";
    if (password !== undefined) {
      effectiveKycPass = password;
    } else if (finalCred?.encryptedPassword) {
      try {
        effectiveKycPass = Buffer.from(finalCred.encryptedPassword, "base64").toString("utf-8");
      } catch {
        effectiveKycPass = "";
      }
    }

    let effectiveRechargePass = "";
    if (rechargePassword !== undefined) {
      effectiveRechargePass = rechargePassword;
    } else if (finalCred?.rechargeEncryptedPassword) {
      try {
        effectiveRechargePass = Buffer.from(finalCred.rechargeEncryptedPassword, "base64").toString("utf-8");
      } catch {
        effectiveRechargePass = "";
      }
    }

    syncToWorker(updated.code, {
      kyc: {
        loginUrl: updated.loginUrl,
        username: username !== undefined ? username : finalCred?.username,
        password: effectiveKycPass,
      },
      recharge: {
        loginUrl: updated.rechargeLoginUrl,
        username: rechargeUsername !== undefined ? rechargeUsername : finalCred?.rechargeUsername,
        password: effectiveRechargePass,
      },
    }).catch(() => {});

    await writeAuditLog({
      actorType: "admin",
      actorId: adminToken,
      action: "UPDATE",
      resource: "provider",
      resourceId: id,
      oldValue: { name: existing.name, isActive: existing.isActive },
      newValue: { name: updated.name, isActive: updated.isActive },
      source: "admin_manual",
    });

    return NextResponse.json({
      ...updated,
      credential: finalCred ? {
        id: finalCred.id,
        username: finalCred.username,
        password: effectiveKycPass,
        rechargeUsername: finalCred.rechargeUsername || "",
        rechargePassword: effectiveRechargePass,
      } : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to update" }, { status: 500 });
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

// DELETE /api/admin/providers/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const p = prisma as any;

    const numCount = await p.number.count({ where: { providerId: id } });
    if (numCount > 0) {
      return NextResponse.json({ error: `Cannot delete: ${numCount} numbers assigned to this provider` }, { status: 400 });
    }

    await p.provider.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to delete provider" }, { status: 500 });
  }
}
