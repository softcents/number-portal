/**
 * lib/rateLimit.ts
 *
 * In-memory rate limiting for the /api/verify endpoint.
 * Three independent buckets:
 *   1. Per-IP:  max 5 requests per 10 minutes
 *   2. Per-NID: max 5 attempts per hour (keyed by SHA-256 of the NID string)
 *   3. Global:  max 20 requests per minute
 *
 * All three must pass; 429 is returned without revealing which limit fired.
 * Replace the Map backing store with Redis for multi-instance deployments.
 */

import { createHash } from "crypto";

interface Bucket {
  count: number;
  windowStart: number; // epoch ms
}

// Global store – survives across requests within the same Node.js process
const ipStore = new Map<string, Bucket>();
const nidStore = new Map<string, Bucket>();
let globalBucket: Bucket = { count: 0, windowStart: Date.now() };

// Config
const IP_LIMIT = 5;
const IP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const NID_LIMIT = 5;
const NID_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const GLOBAL_LIMIT = 20;
const GLOBAL_WINDOW_MS = 60 * 1000; // 1 minute

function slide(store: Map<string, Bucket>, key: string, windowMs: number): Bucket {
  const now = Date.now();
  const existing = store.get(key);
  if (!existing || now - existing.windowStart >= windowMs) {
    const fresh: Bucket = { count: 0, windowStart: now };
    store.set(key, fresh);
    return fresh;
  }
  return existing;
}

function slideGlobal(windowMs: number): Bucket {
  const now = Date.now();
  if (now - globalBucket.windowStart >= windowMs) {
    globalBucket = { count: 0, windowStart: now };
  }
  return globalBucket;
}

/**
 * Check and increment all three rate-limit buckets.
 *
 * @param ip  - Client IP (already resolved with TRUST_PROXY logic by the caller)
 * @param nid - Raw NID digits (will be SHA-256 hashed before storing)
 * @returns true  if the request is allowed
 *          false if any limit is exceeded (caller should return 429)
 */
export function checkRateLimit(ip: string, nid: string): boolean {
  // --- Global ---
  const gb = slideGlobal(GLOBAL_WINDOW_MS);
  if (gb.count >= GLOBAL_LIMIT) return false;

  // --- Per-IP ---
  const ipBucket = slide(ipStore, ip, IP_WINDOW_MS);
  if (ipBucket.count >= IP_LIMIT) return false;

  // --- Per-NID (hashed key so we never store the raw NID) ---
  const nidKey = createHash("sha256").update(nid).digest("hex");
  const nidBucket = slide(nidStore, nidKey, NID_WINDOW_MS);
  if (nidBucket.count >= NID_LIMIT) return false;

  // All limits have headroom – consume one slot from each
  gb.count++;
  ipBucket.count++;
  nidBucket.count++;
  return true;
}
