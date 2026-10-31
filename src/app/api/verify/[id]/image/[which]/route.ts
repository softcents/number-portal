/**
 * GET /api/verify/[id]/image/[which]
 *
 * Proxies verified photo or document from the Python worker to the browser.
 * Validates the 32-hex job ID and 'which' ('photo' | 'document').
 * Streams bytes back with the stored content-type.
 * Headers: Cache-Control: no-store, X-Content-Type-Options: nosniff,
 * X-Frame-Options: SAMEORIGIN, and Content-Disposition: inline for PDFs.
 * Returns 404 on any failure.
 */

import { NextRequest, NextResponse } from "next/server";

const WORKER_URL = process.env.WORKER_URL ?? "";
const WORKER_SECRET = process.env.WORKER_SECRET ?? "";

// Exactly 32 lower-case hex characters
const JOB_ID_RE = /^[0-9a-f]{32}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; which: string }> }
): Promise<NextResponse> {
  // params is a Promise in Next.js 15+ / 16+; must await it
  const { id, which } = await params;

  if (
    !JOB_ID_RE.test(id) ||
    (which !== "photo" && which !== "document" && which !== "documentBack")
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (!WORKER_URL || !WORKER_SECRET) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${WORKER_URL}/jobs/${id}/image/${which}`, {
      method: "GET",
      headers: {
        "x-worker-secret": WORKER_SECRET,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");

    if (contentType.toLowerCase().includes("application/pdf")) {
      const filename = which === "documentBack" ? "document-back.pdf" : "document.pdf";
      headers.set("Content-Disposition", `inline; filename="${filename}"`);
    }

    return new NextResponse(res.body as BodyInit, {
      status: 200,
      headers,
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  } finally {
    clearTimeout(timeoutId);
  }
}
