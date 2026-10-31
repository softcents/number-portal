/**
 * GET /api/verify/[id]
 *
 * Polls the Python worker for a job's status and proxies only {status, match}
 * back to the browser. Never exposes WORKER_URL or WORKER_SECRET to the client.
 *
 * In Next.js 15+ (this project runs 16.x), `params` is a Promise and must
 * be awaited.
 */

import { NextRequest, NextResponse } from "next/server";
import { mapProfileToSubscriberForm, SubscriberPrefill } from "@/lib/subscriberMapper";
import { recordSearchResolution } from "@/lib/adminAudit";

const WORKER_URL = process.env.WORKER_URL ?? "";
const WORKER_SECRET = process.env.WORKER_SECRET ?? "";

// Exactly 32 lower-case hex characters (uuid4 hex format from the worker)
const JOB_ID_RE = /^[0-9a-f]{32}$/;

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // params is a Promise in Next.js 15+; must await it
  const { id } = await params;

  if (!JOB_ID_RE.test(id)) {
    return secureResponse({ error: "invalid_input" }, 400);
  }

  if (!WORKER_URL || !WORKER_SECRET) {
    console.error("[verify/[id]] WORKER_URL or WORKER_SECRET is not configured");
    return secureResponse({ status: "error" }, 200);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(`${WORKER_URL}/jobs/${id}`, {
      method: "GET",
      headers: {
        "x-worker-secret": WORKER_SECRET,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (res.status === 404) {
      return secureResponse({ status: "error" }, 200);
    }

    if (!res.ok) {
      console.error(`[verify/[id]] Worker returned HTTP ${res.status}`);
      return secureResponse({ status: "error" }, 200);
    }

    const data = (await res.json()) as {
      status: string;
      match?: boolean;
      profile?: unknown;
      images?: {
        photo?: boolean;
        document?: boolean;
        documentType?: "pdf" | "image" | null;
        documentBack?: boolean;
        documentBackType?: "pdf" | "image" | null;
        photoSize?: [number, number] | null;
      };
    };

    if (data.status === "done" && data.match === true) {
      const { prefill, filledFields } = mapProfileToSubscriberForm(data.profile);

      if (data.images?.photo) {
        prefill.photoUrl = `/api/verify/${id}/image/photo`;
        if (!filledFields.includes("photo")) {
          filledFields.push("photo");
        }
      }

      if (data.images?.document) {
        prefill.documentUrl = `/api/verify/${id}/image/document`;
        prefill.documentType = data.images.documentType ?? null;
        if (!filledFields.includes("document")) {
          filledFields.push("document");
        }
      }

      if (data.images?.documentBack) {
        prefill.documentBackUrl = `/api/verify/${id}/image/documentBack`;
        prefill.documentBackType = data.images.documentBackType ?? null;
        if (!filledFields.includes("documentBack")) {
          filledFields.push("documentBack");
        }
      }

      // Log matched result to admin audit system (non-blocking)
      recordSearchResolution({
        jobId: id,
        status: "MATCHED",
        matchFound: true,
        redirectedToCentral: false,
        matchedProfile: data.profile,
        filledFields,
        photoUrl: prefill.photoUrl || null,
        documentUrl: prefill.documentUrl || null,
        documentBackUrl: prefill.documentBackUrl || null,
      }).catch(() => {});

      return secureResponse(
        {
          status: "done",
          match: true,
          prefill,
          filledFields,
        },
        200
      );
    }

    if (data.status === "done" && data.match === false) {
      recordSearchResolution({
        jobId: id,
        status: "NO_MATCH",
        matchFound: false,
        redirectedToCentral: true,
        errorMessage: "No identity match found; redirected to central registration portal",
      }).catch(() => {});
    }

    const responseBody: {
      status: string;
      match?: boolean;
      prefill?: SubscriberPrefill;
      filledFields?: string[];
    } = {
      status: data.status,
    };
    if (data.status === "done" && typeof data.match === "boolean") {
      responseBody.match = data.match;
    }

    return secureResponse(responseBody, 200);
  } catch (err) {
    console.error("[verify/[id]] Fetch failed:", err);
    return secureResponse({ status: "error" }, 200);
  } finally {
    clearTimeout(timeoutId);
  }
}
