import { prisma } from "@/lib/prisma";

// ─── Valid status transitions ────────────────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE:   ["RESERVED", "ACTIVE", "BLOCKED"],
  RESERVED:    ["AVAILABLE", "PROCESSING", "ACTIVE", "BLOCKED"],
  PROCESSING:  ["ACTIVE", "FAILED", "AVAILABLE", "BLOCKED"],
  ACTIVE:      ["SUSPENDED", "RELEASED", "AVAILABLE", "BLOCKED"],
  SUSPENDED:   ["ACTIVE", "AVAILABLE", "BLOCKED"],
  RELEASED:    ["AVAILABLE", "ACTIVE", "BLOCKED"],
  FAILED:      ["AVAILABLE", "ACTIVE", "PROCESSING", "BLOCKED"],
  BLOCKED:     ["AVAILABLE", "ACTIVE"],
};

export function canTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

// ─── Normalize phone number ──────────────────────────────────────────────────
export function normalizeNumber(raw: string): string {
  // Strip all non-digits
  const digits = raw.replace(/\D/g, "");
  // Bangladeshi: if starts with 880, keep as-is; if starts with 0, replace with 880
  if (digits.startsWith("880") && digits.length === 13) return digits;
  if (digits.startsWith("0") && digits.length === 11) return "880" + digits.slice(1);
  if (digits.length === 10) return "880" + digits;
  return digits;
}

// ─── Change number status with full audit ───────────────────────────────────
export async function changeNumberStatus(params: {
  numberId: string;
  toStatus: string;
  changedBy: string;
  reason?: string;
  source?: "system" | "admin_manual" | "provider";
  ipAddress?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { numberId, toStatus, changedBy, reason, source = "system", ipAddress } = params;

  const number = await (prisma as any).number.findUnique({
    where: { id: numberId },
    select: { id: true, status: true, number: true },
  });

  if (!number) return { success: false, error: "Number not found" };

  if (source !== "admin_manual" && !canTransition(number.status, toStatus)) {
    return {
      success: false,
      error: `Cannot transition from ${number.status} to ${toStatus}`,
    };
  }

  await (prisma as any).$transaction([
    (prisma as any).number.update({
      where: { id: numberId },
      data: { status: toStatus, updatedAt: new Date() },
    }),
    (prisma as any).numberStatusHistory.create({
      data: {
        numberId,
        fromStatus: number.status,
        toStatus,
        changedBy,
        reason: reason ?? null,
        source,
        ipAddress: ipAddress ?? null,
      },
    }),
  ]);

  return { success: true };
}

// ─── Create number ───────────────────────────────────────────────────────────
export async function createNumber(data: {
  number: string;
  country?: string;
  countryCode?: string;
  city?: string;
  area?: string;
  numberType?: string;
  callRate?: number;
  costPrice?: number;
  salePrice?: number;
  providerId?: string;
  providerReferenceId?: string;
  displayCompanyId?: string;
  notes?: string;
  adminId: string;
}) {
  const normalizedNumber = normalizeNumber(data.number);

  const existing = await (prisma as any).number.findFirst({
    where: { OR: [{ number: data.number }, { normalizedNumber }] },
  });
  if (existing) throw new Error(`Number ${data.number} already exists`);

  // Auto-detect provider & display company from IPTSP prefix if omitted
  let displayCompanyId = data.displayCompanyId ?? null;
  let providerId = data.providerId ?? null;

  if (!displayCompanyId || !providerId) {
    const clean = normalizedNumber.replace(/^880/, "0");
    const m = clean.match(/^(096\d{2})/);
    if (m) {
      const prefix = m[1];
      if (!displayCompanyId) {
        const dc = await (prisma as any).displayCompany.findUnique({ where: { code: prefix } });
        if (dc) displayCompanyId = dc.id;
      }
      if (!providerId) {
        const pCode = prefix === "09644" ? "ICON" : (prefix === "09617" ? "RANKSITT" : (prefix === "09639" ? "ICC" : null));
        if (pCode) {
          const prov = await (prisma as any).provider.findFirst({
            where: {
              OR: [
                { code: pCode },
                ...(pCode === "RANKSITT" ? [{ code: "RANKS" }] : []),
              ],
            },
          });
          if (prov) providerId = prov.id;
        }
      }
    }
  }

  const created = await (prisma as any).number.create({
    data: {
      number: data.number.trim(),
      normalizedNumber,
      country: data.country ?? "BD",
      countryCode: data.countryCode ?? "+880",
      city: data.city ?? null,
      area: data.area ?? null,
      numberType: data.numberType ?? "MOBILE",
      callRate: data.callRate ?? null,
      costPrice: data.costPrice ?? null,
      salePrice: data.salePrice ?? null,
      providerId,
      providerReferenceId: data.providerReferenceId ?? null,
      displayCompanyId,
      status: "AVAILABLE",
      notes: data.notes ?? null,
    },
    include: { provider: true, displayCompany: true },
  });

  // Record initial status history
  await (prisma as any).numberStatusHistory.create({
    data: {
      numberId: created.id,
      fromStatus: null,
      toStatus: "AVAILABLE",
      changedBy: data.adminId,
      reason: "Number created",
      source: "admin_manual",
    },
  });

  // Write system audit log
  await writeAuditLog({
    actorType: "admin",
    actorId: data.adminId,
    action: "CREATE",
    resource: "number",
    resourceId: created.id,
    newValue: { number: data.number, status: "AVAILABLE" },
  });

  return created;
}

// ─── Get numbers with filters ────────────────────────────────────────────────
export async function getNumbers(filter?: {
  status?: string;
  providerId?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}) {
  const p = prisma as any;
  const where: any = {};

  if (filter?.status && filter.status !== "ALL") {
    where.status = filter.status;
  }
  if (filter?.providerId && filter.providerId !== "ALL") {
    where.providerId = filter.providerId;
  }
  if (filter?.query?.trim()) {
    const q = filter.query.trim();
    where.OR = [
      { number: { contains: q } },
      { normalizedNumber: { contains: q } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }

  const page = filter?.page ?? 1;
  const pageSize = filter?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const [total, rows] = await Promise.all([
    p.number.count({ where }),
    p.number.findMany({
      where,
      include: {
        provider: { select: { id: true, code: true, name: true } },
        displayCompany: { select: { id: true, code: true, name: true } },
        customer: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return { total, rows, page, pageSize, pages: Math.ceil(total / pageSize) };
}

// ─── System audit log helper ─────────────────────────────────────────────────
export async function writeAuditLog(data: {
  actorType: string;
  actorId: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  source?: string;
  ipAddress?: string;
}) {
  try {
    await (prisma as any).systemAuditLog.create({ data });
  } catch {
    // Non-blocking — audit failure must not break main flow
  }
}
