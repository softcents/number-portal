/**
 * GET /api/submit/[id]
 *
 * Polls the Python worker for a submit-job's status and proxies
 * {status, stage?, reason?, durationMs?} back to the browser.
 *
 * In Next.js 15+ (this project runs 16.x), `params` is a Promise and must
 * be awaited.
 */

import { NextRequest, NextResponse } from "next/server";
import { recordSubmissionFinished } from "@/lib/adminAudit";

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
  const { id } = await params;

  if (!JOB_ID_RE.test(id)) {
    return secureResponse({ error: "invalid_input" }, 400);
  }

  if (!WORKER_URL || !WORKER_SECRET) {
    console.error("[submit/[id]] WORKER_URL or WORKER_SECRET is not configured");
    return secureResponse({ status: "error", reason: "unavailable" }, 200);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(`${WORKER_URL}/submit-jobs/${id}`, {
      method: "GET",
      headers: {
        "x-worker-secret": WORKER_SECRET,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (res.status === 404) {
      return secureResponse({ status: "error", reason: "unknown" }, 200);
    }

    if (!res.ok) {
      console.error(`[submit/[id]] Worker returned HTTP ${res.status}`);
      return secureResponse({ status: "error", reason: "unknown" }, 200);
    }

    const data = (await res.json()) as {
      status: string;
      stage?: string;
      reason?: string;
      durationMs?: number;
    };

    if (data.status === "done") {
      recordSubmissionFinished({
        submitJobId: id,
        status: "SUCCESS",
        stage: data.stage,
        durationMs: data.durationMs,
      }).catch(() => {});
    } else if (data.status === "error") {
      recordSubmissionFinished({
        submitJobId: id,
        status: "FAILED",
        stage: data.stage,
        failureReason: data.reason,
      }).catch(() => {});
    }

    return secureResponse(data, 200);
  } catch (err) {
    console.error("[submit/[id]] Fetch failed:", err);
    return secureResponse({ status: "error", reason: "unknown" }, 200);
  } finally {
    clearTimeout(timeoutId);
  }
}
