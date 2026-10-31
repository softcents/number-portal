/**
 * POST /api/verify
 *
 * Accepts {nid, dob} (and optional captchaToken when TURNSTILE_SECRET_KEY is set).
 * - Enforces 1 KB body limit
 * - Validates NID and DOB (same rules as the worker)
 * - Rejects unknown fields
 * - Applies per-IP / per-NID / global rate limits
 * - Optionally verifies Cloudflare Turnstile CAPTCHA (no new npm package)
 * - Forwards the job to the Python worker with x-worker-secret
 * - Returns {jobId} or appropriate error
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { recordSearchInitiated } from "@/lib/adminAudit";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKER_URL = process.env.WORKER_URL ?? "";
const WORKER_SECRET = process.env.WORKER_SECRET ?? "";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? "";

// Warn once at startup if CAPTCHA is disabled
let _captchaWarnLogged = false;

// ---------------------------------------------------------------------------
// Validation patterns (mirrors the Python worker)
// ---------------------------------------------------------------------------

const NID_RE = /^\d{10}$|^\d{13}$|^\d{17}$/;
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_FIELDS = new Set(["nid", "dob", "captchaToken"]);

function isValidDate(dob: string): boolean {
  if (!DOB_RE.test(dob)) return false;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d > today) return false;
  if (d < new Date("1900-01-01")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Security headers applied to every response from this route
// ---------------------------------------------------------------------------

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

function secureResponse(body: unknown, status: number): NextResponse {
  const res = NextResponse.json(body, { status });
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Client IP resolution
// ---------------------------------------------------------------------------

function getClientIp(req: NextRequest): string {
  if (TRUST_PROXY) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      // Only trust the first entry
      return xff.split(",")[0].trim();
    }
  }
  // Fall back to the socket IP (Next.js exposes it via nextUrl or ip)
  // In Next.js 15+ the request object carries .ip
  const ip = (req as unknown as { ip?: string }).ip;
  return ip ?? "unknown";
}

// ---------------------------------------------------------------------------
// Turnstile verification (no new npm dependency – uses native fetch)
// ---------------------------------------------------------------------------

async function verifyCaptcha(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: TURNSTILE_SECRET_KEY,
          response: token,
        }),
      }
    );
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Log CAPTCHA warning once
  if (!TURNSTILE_SECRET_KEY && !_captchaWarnLogged) {
    console.warn(
      "[verify] TURNSTILE_SECRET_KEY is not set – form is unprotected by CAPTCHA"
    );
    _captchaWarnLogged = true;
  }

  // ---- Body size guard (< 1 KB) ------------------------------------------
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 1024) {
    return secureResponse({ error: "invalid_input" }, 400);
  }

  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return secureResponse({ error: "invalid_input" }, 400);
  }

  if (rawText.length > 1024) {
    return secureResponse({ error: "invalid_input" }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawText);
  } catch {
    return secureResponse({ error: "invalid_input" }, 400);
  }

  // ---- Reject unknown fields ----------------------------------------------
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return secureResponse({ error: "invalid_input" }, 400);
    }
  }

  const nid = body.nid;
  const dob = body.dob;
  const captchaToken = body.captchaToken;

  // ---- Field validation ---------------------------------------------------
  if (typeof nid !== "string" || !NID_RE.test(nid)) {
    return secureResponse({ error: "invalid_input" }, 400);
  }
  if (typeof dob !== "string" || !isValidDate(dob)) {
    return secureResponse({ error: "invalid_input" }, 400);
  }

  // ---- CAPTCHA verification -----------------------------------------------
  if (TURNSTILE_SECRET_KEY) {
    if (typeof captchaToken !== "string" || !captchaToken) {
      return secureResponse({ error: "invalid_input" }, 400);
    }
    const ok = await verifyCaptcha(captchaToken);
    if (!ok) {
      return secureResponse({ error: "invalid_input" }, 400);
    }
  }

  // ---- Rate limiting -------------------------------------------------------
  const ip = getClientIp(req);
  if (!checkRateLimit(ip, nid)) {
    return secureResponse({ error: "rate_limited" }, 429);
  }

  // ---- Forward to worker --------------------------------------------------
  if (!WORKER_URL || !WORKER_SECRET) {
    console.error("[verify] WORKER_URL or WORKER_SECRET is not configured");
    return secureResponse({ error: "unavailable" }, 502);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);

  try {
    const workerRes = await fetch(`${WORKER_URL}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": WORKER_SECRET,
      },
      body: JSON.stringify({ nid, dob }),
      signal: controller.signal,
    });

    if (!workerRes.ok) {
      console.error(`[verify] Worker returned HTTP ${workerRes.status}`);
      return secureResponse({ error: "unavailable" }, 502);
    }

    const data = (await workerRes.json()) as { jobId: string };
    // Log to admin audit system (non-blocking)
    recordSearchInitiated({
      jobId: data.jobId,
      nid,
      dob,
      ipAddress: ip,
    }).catch(() => {});

    return secureResponse({ jobId: data.jobId }, 200);
  } catch (err) {
    console.error("[verify] Worker fetch failed:", err);
    return secureResponse({ error: "unavailable" }, 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
