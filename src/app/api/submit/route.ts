/**
 * POST /api/submit
 *
 * Accepts multipart/form-data from the browser with:
 *   - "fields" part: JSON string with all subscriber form values
 *   - "photo" part (optional): JPEG/PNG image
 *   - "document" part (optional): PDF/JPEG/PNG
 *
 * Validates required fields, enforces ~20 MB body limit, applies per-IP rate
 * limit, then forwards to the Python worker's /submit-jobs endpoint.
 * Returns {submitJobId} or appropriate error.
 *
 * Never exposes WORKER_URL, WORKER_SECRET, or ICC credentials to the client.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordSubmissionStarted } from "@/lib/adminAudit";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKER_URL = process.env.WORKER_URL ?? "";
const WORKER_SECRET = process.env.WORKER_SECRET ?? "";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

// ~20 MB body limit
const MAX_BODY_BYTES = 20 * 1024 * 1024;

// Per-IP rate limit for submit (3 requests per 5 minutes)
const SUBMIT_IP_LIMIT = 3;
const SUBMIT_IP_WINDOW_MS = 5 * 60 * 1000;
const submitIpStore = new Map<string, { count: number; windowStart: number }>();

// ---------------------------------------------------------------------------
// Security headers
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
// Helpers
// ---------------------------------------------------------------------------

function getClientIp(req: NextRequest): string {
  if (TRUST_PROXY) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
  }
  const ip = (req as unknown as { ip?: string }).ip;
  return ip ?? "unknown";
}

function checkSubmitRateLimit(ip: string): boolean {
  const now = Date.now();
  const existing = submitIpStore.get(ip);
  if (!existing || now - existing.windowStart >= SUBMIT_IP_WINDOW_MS) {
    submitIpStore.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (existing.count >= SUBMIT_IP_LIMIT) return false;
  existing.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ---- Body size guard ----------------------------------------------------
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return secureResponse({ error: "body_too_large" }, 413);
  }

  // ---- Rate limiting -------------------------------------------------------
  const ip = getClientIp(req);
  if (!checkSubmitRateLimit(ip)) {
    return secureResponse({ error: "rate_limited" }, 429);
  }

  // ---- Parse multipart form ------------------------------------------------
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return secureResponse({ error: "invalid_input" }, 400);
  }

  // ---- Extract and validate fields JSON ------------------------------------
  const fieldsRaw = formData.get("fields");
  if (!fieldsRaw || typeof fieldsRaw !== "string") {
    return secureResponse({ error: "missing_fields" }, 400);
  }

  let fields: Record<string, unknown>;
  try {
    fields = JSON.parse(fieldsRaw);
  } catch {
    return secureResponse({ error: "invalid_fields_json" }, 400);
  }

  // Validate required fields
  const required = [
    "subscriberName",
    "subscriberType",
    "phoneNumber",
    "birthDate",
    "validEmail",
  ];
  const missing = required.filter(
    (f) => !String(fields[f] ?? "").trim()
  );

  const nidVal = String(fields.nationalIdNumber ?? "").trim();
  const passportVal = String(fields.passportNumber ?? "").trim();
  if (!nidVal && !passportVal) {
    missing.push("nationalIdNumber or passportNumber");
  }

  if (missing.length > 0) {
    return secureResponse(
      { error: "validation_failed", missing },
      400
    );
  }

  // ---- Forward to worker as multipart -------------------------------------
  if (!WORKER_URL || !WORKER_SECRET) {
    console.error("[submit] WORKER_URL or WORKER_SECRET is not configured");
    return secureResponse({ error: "unavailable" }, 502);
  }

  const targetProvider = String(fields.provider || "ICC").toUpperCase();
  try {
    const provRecord = await (prisma as any).provider.findUnique({
      where: { code: targetProvider },
      include: { credential: true },
    });
    if (provRecord) {
      if (provRecord.loginUrl) fields.providerLoginUrl = provRecord.loginUrl;
      if (provRecord.credential?.username) fields.providerUsername = provRecord.credential.username;
      if (provRecord.credential?.encryptedPassword) {
        fields.providerPassword = Buffer.from(provRecord.credential.encryptedPassword, "base64").toString("utf-8");
      }
    }
  } catch (err: any) {
    console.warn("[submit] Failed to lookup provider credentials:", err?.message);
  }

  // Build a new FormData to send to the worker
  const workerForm = new FormData();
  workerForm.append("fields", JSON.stringify(fields));

  const photo = formData.get("photo");
  if (photo && photo instanceof Blob && photo.size > 0) {
    const photoBuf = await photo.arrayBuffer();
    workerForm.append(
      "photo",
      new Blob([photoBuf], { type: photo.type || "image/jpeg" }),
      (photo as File).name || "photo.jpg"
    );
  }

  const document = formData.get("document");
  if (document && document instanceof Blob && document.size > 0) {
    const docBuf = await document.arrayBuffer();
    const isPdf =
      document.type === "application/pdf" ||
      (document as File).name?.toLowerCase().endsWith(".pdf");
    const docType = document.type || (isPdf ? "application/pdf" : "image/jpeg");
    const docName =
      (document as File).name || (isPdf ? "document.pdf" : "document.jpg");
    workerForm.append(
      "document",
      new Blob([docBuf], { type: docType }),
      docName
    );
  }

  const documentBack = formData.get("documentBack");
  if (documentBack && documentBack instanceof Blob && documentBack.size > 0) {
    const docBackBuf = await documentBack.arrayBuffer();
    const isBackPdf =
      documentBack.type === "application/pdf" ||
      (documentBack as File).name?.toLowerCase().endsWith(".pdf");
    const docBackType =
      documentBack.type || (isBackPdf ? "application/pdf" : "image/jpeg");
    const docBackName =
      (documentBack as File).name ||
      (isBackPdf ? "document-back.pdf" : "document-back.jpg");
    workerForm.append(
      "documentBack",
      new Blob([docBackBuf], { type: docBackType }),
      docBackName
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);

  try {
    const workerRes = await fetch(`${WORKER_URL}/submit-jobs`, {
      method: "POST",
      headers: {
        "x-worker-secret": WORKER_SECRET,
      },
      body: workerForm,
      signal: controller.signal,
    });

    if (!workerRes.ok) {
      const errorBody = await workerRes.text().catch(() => "");
      console.error(
        `[submit] Worker returned HTTP ${workerRes.status}: ${errorBody.slice(0, 200)}`
      );
      // Forward validation errors from the worker
      if (workerRes.status === 400) {
        try {
          const parsed = JSON.parse(errorBody);
          return secureResponse(
            { error: "validation_failed", detail: parsed.detail },
            400
          );
        } catch {
          return secureResponse({ error: "validation_failed" }, 400);
        }
      }
      return secureResponse({ error: "unavailable" }, 502);
    }

    const data = (await workerRes.json()) as { submitJobId: string };
    // Log to admin audit system (non-blocking)
    recordSubmissionStarted({
      submitJobId: data.submitJobId,
      fields,
      hasPhoto: Boolean(photo),
      hasDocument: Boolean(document),
      hasDocumentBack: Boolean(documentBack),
    }).catch(() => {});

    return secureResponse({ submitJobId: data.submitJobId }, 200);
  } catch (err) {
    console.error("[submit] Worker fetch failed:", err);
    return secureResponse({ error: "unavailable" }, 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
