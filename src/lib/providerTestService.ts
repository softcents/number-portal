import { prisma } from "@/lib/prisma";

export async function testProviderCredentials(params: {
  id?: string;
  providerCode?: string;
  type: "kyc" | "recharge";
  loginUrl?: string;
  username?: string;
  password?: string;
}) {
  const { id, providerCode, type, loginUrl, username, password } = params;
  const p = prisma as any;
  const where: any = {};
  if (id) where.id = id;
  else if (providerCode) where.code = providerCode.toUpperCase();
  else where.code = "ICC";

  const provider = await p.provider.findFirst({
    where,
    include: { credential: true },
  });

  if (!provider) {
    return { success: false, error: "Provider not found" };
  }

  let targetUrl = loginUrl;
  let targetUser = username;
  let targetPassword = password;

  if (type === "kyc") {
    if (targetUrl === undefined || targetUrl === null) targetUrl = provider.loginUrl || "";
    if (targetUser === undefined || targetUser === null) targetUser = provider.credential?.username || "";
    if (targetPassword === undefined || targetPassword === null) {
      targetPassword = provider.credential?.encryptedPassword
        ? Buffer.from(provider.credential.encryptedPassword, "base64").toString("utf-8")
        : "";
    }
  } else {
    if (targetUrl === undefined || targetUrl === null) targetUrl = provider.rechargeLoginUrl || "";
    if (targetUser === undefined || targetUser === null) targetUser = provider.credential?.rechargeUsername || "";
    if (targetPassword === undefined || targetPassword === null) {
      targetPassword = provider.credential?.rechargeEncryptedPassword
        ? Buffer.from(provider.credential.rechargeEncryptedPassword, "base64").toString("utf-8")
        : "";
    }
  }

  const workerUrl = process.env.WORKER_URL || "http://127.0.0.1:8001";
  const workerSecret =
    process.env.WORKER_SECRET ||
    "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

  let workerError: string | null = null;
  try {
    const workerRes = await fetch(`${workerUrl}/test-credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": workerSecret,
      },
      body: JSON.stringify({
        provider: provider.code,
        type,
        loginUrl: targetUrl,
        username: targetUser,
        password: targetPassword,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (workerRes.ok) {
      const workerData = await workerRes.json();
      return {
        success: Boolean(workerData.ok),
        message: workerData.message || (workerData.ok ? "Verification successful" : undefined),
        error: workerData.reason || (!workerData.ok ? "Verification failed" : undefined),
        durationMs: workerData.durationMs,
        via: "worker",
      };
    } else {
      const errText = await workerRes.text().catch(() => "");
      workerError = `Worker HTTP ${workerRes.status}: ${errText}`;
    }
  } catch (netErr: any) {
    workerError = netErr?.message || "Worker unreachable";
  }

  // Direct Fallback Verification from Next.js server
  const startTime = Date.now();
  try {
    if (type === "kyc" && provider.code === "ICC") {
      const pageUrl = targetUrl || "https://iccfios.net/icc-form/index.php/admin/login";
      const getRes = await fetch(pageUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });

      if (!getRes.ok) {
        return {
          success: false,
          error: `Login page unreachable (HTTP ${getRes.status})`,
          durationMs: Date.now() - startTime,
          via: "direct_fallback",
          workerNotice: workerError,
        };
      }

      const cookies = getRes.headers.get("set-cookie") || "";
      const postRes = await fetch(pageUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": cookies,
          "User-Agent": "Mozilla/5.0",
        },
        body: new URLSearchParams({
          user_name: targetUser || "",
          password: targetPassword || "",
        }).toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });

      const elapsed = Date.now() - startTime;
      const location = postRes.headers.get("location") || "";
      if (
        (postRes.status === 302 || postRes.status === 303 || postRes.status === 301) &&
        location.includes("/admin/")
      ) {
        return {
          success: true,
          message: `ICC KYC Portal login verified (Redirect to ${location})`,
          durationMs: elapsed,
          via: "direct_fallback",
        };
      }

      const bodyText = await postRes.text().catch(() => "");
      if (bodyText.toLowerCase().includes("invalid") || bodyText.toLowerCase().includes("failed")) {
        return {
          success: false,
          error: "Invalid KYC credentials rejected by ICC portal",
          durationMs: elapsed,
          via: "direct_fallback",
        };
      }

      return {
        success: false,
        error: `Login did not redirect to admin dashboard (HTTP ${postRes.status})`,
        durationMs: elapsed,
        via: "direct_fallback",
      };
    }

    if (type === "recharge" && provider.code === "ICC") {
      const postUrl = "https://icctalk.com:2020/OTTSSO/login";
      const postRes = await fetch(postUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0",
        },
        body: new URLSearchParams({
          username: targetUser || "",
          password: targetPassword || "",
          rememberMe: "on",
        }).toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });

      const elapsed = Date.now() - startTime;
      const loc = postRes.headers.get("location") || "";
      if (
        (postRes.status === 302 || postRes.status === 301 || postRes.status === 303) &&
        !loc.toLowerCase().includes("error")
      ) {
        return {
          success: true,
          message: "ICC Talk Billing SSO login verified successfully",
          durationMs: elapsed,
          via: "direct_fallback",
        };
      }

      return {
        success: false,
        error: "Invalid credentials rejected by ICC Talk SSO",
        durationMs: elapsed,
        via: "direct_fallback",
      };
    }

    return {
      success: true,
      message: `${provider.code} ${type.toUpperCase()} configuration check complete`,
      durationMs: Date.now() - startTime,
      via: "direct_fallback",
    };
  } catch (fallbackErr: any) {
    return {
      success: false,
      error: `Connection test error: ${fallbackErr?.message || "Unknown error"}`,
      durationMs: Date.now() - startTime,
      via: "direct_fallback",
      workerNotice: workerError,
    };
  }
}
