import { prisma } from "@/lib/prisma";

export interface SearchAuditRecord {
  id: string;
  jobId?: string | null;
  nid: string;
  dob: string;
  status: string;
  matchFound: boolean;
  redirectedToCentral: boolean;
  ipAddress?: string | null;
  matchedProfile?: any;
  filledFields?: any;
  photoUrl?: string | null;
  documentUrl?: string | null;
  documentBackUrl?: string | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionAuditRecord {
  id: string;
  submitJobId?: string | null;
  searchId?: string | null;
  status: string;
  stage?: string | null;
  subscriberName?: string | null;
  nationalIdNumber?: string | null;
  phoneNumber?: string | null;
  connection?: string | null;
  subscriberType?: string | null;
  allFormFields?: any;
  userFilledFields?: any;
  hasPhoto: boolean;
  hasDocument: boolean;
  hasDocumentBack: boolean;
  photoData?: string | null;
  documentData?: string | null;
  documentBackData?: string | null;
  durationMs?: number | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Real Database Audit Recording (100% PostgreSQL via Prisma)
// ---------------------------------------------------------------------------

export async function recordSearchInitiated(params: {
  jobId: string;
  nid: string;
  dob: string;
  ipAddress?: string;
}): Promise<void> {
  const p = prisma as any;
  try {
    if (p.verificationSearch?.create) {
      await p.verificationSearch.create({
        data: {
          jobId: params.jobId,
          nid: params.nid,
          dob: params.dob,
          status: "PENDING",
          matchFound: false,
          redirectedToCentral: false,
          ipAddress: params.ipAddress || null,
        },
      });
      return;
    }

    // Direct PostgreSQL raw query
    const id = `srch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await p.$executeRawUnsafe(
      `INSERT INTO "verification_searches" ("id", "jobId", "nid", "dob", "status", "matchFound", "redirectedToCentral", "ipAddress", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      id,
      params.jobId,
      params.nid,
      params.dob,
      "PENDING",
      false,
      false,
      params.ipAddress || null
    );
  } catch (error) {
    console.error("[Audit DB] Failed to record search initiation:", error);
  }
}

export async function recordSearchResolution(params: {
  jobId: string;
  status: "MATCHED" | "NO_MATCH" | "FAILED";
  matchFound: boolean;
  redirectedToCentral?: boolean;
  matchedProfile?: any;
  filledFields?: string[];
  photoUrl?: string | null;
  documentUrl?: string | null;
  documentBackUrl?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const p = prisma as any;
  const isRedirected = params.redirectedToCentral ?? (params.status === "NO_MATCH");
  try {
    if (p.verificationSearch?.updateMany) {
      await p.verificationSearch.updateMany({
        where: { jobId: params.jobId },
        data: {
          status: params.status,
          matchFound: params.matchFound,
          redirectedToCentral: isRedirected,
          matchedProfile: params.matchedProfile ? params.matchedProfile : undefined,
          filledFields: params.filledFields ? params.filledFields : undefined,
          photoUrl: params.photoUrl || null,
          documentUrl: params.documentUrl || null,
          documentBackUrl: params.documentBackUrl || null,
          errorMessage: params.errorMessage || null,
        },
      });
      return;
    }

    // Direct PostgreSQL raw query
    await p.$executeRawUnsafe(
      `UPDATE "verification_searches"
       SET "status" = $1, "matchFound" = $2, "redirectedToCentral" = $3,
           "matchedProfile" = $4::jsonb, "filledFields" = $5::jsonb,
           "photoUrl" = $6, "documentUrl" = $7, "documentBackUrl" = $8,
           "errorMessage" = $9, "updatedAt" = NOW()
       WHERE "jobId" = $10`,
      params.status,
      params.matchFound,
      isRedirected,
      params.matchedProfile ? JSON.stringify(params.matchedProfile) : null,
      params.filledFields ? JSON.stringify(params.filledFields) : null,
      params.photoUrl || null,
      params.documentUrl || null,
      params.documentBackUrl || null,
      params.errorMessage || null,
      params.jobId
    );
  } catch (error) {
    console.error("[Audit DB] Failed to record search resolution:", error);
  }
}

export async function recordCentralRedirect(params: {
  jobId?: string;
  nid?: string;
  dob?: string;
}): Promise<void> {
  const p = prisma as any;
  try {
    if (params.jobId) {
      if (p.verificationSearch?.updateMany) {
        await p.verificationSearch.updateMany({
          where: { jobId: params.jobId },
          data: { redirectedToCentral: true },
        });
        return;
      }
      await p.$executeRawUnsafe(
        `UPDATE "verification_searches" SET "redirectedToCentral" = true, "updatedAt" = NOW() WHERE "jobId" = $1`,
        params.jobId
      );
      return;
    }

    if (params.nid) {
      if (p.verificationSearch?.findFirst) {
        const latest = await p.verificationSearch.findFirst({
          where: { nid: params.nid },
          orderBy: { createdAt: "desc" },
        });
        if (latest) {
          await p.verificationSearch.update({
            where: { id: latest.id },
            data: { redirectedToCentral: true },
          });
          return;
        }
      }
      await p.$executeRawUnsafe(
        `UPDATE "verification_searches" SET "redirectedToCentral" = true, "updatedAt" = NOW()
         WHERE "id" = (SELECT "id" FROM "verification_searches" WHERE "nid" = $1 ORDER BY "createdAt" DESC LIMIT 1)`,
        params.nid
      );
    }
  } catch (error) {
    console.error("[Audit DB] Failed to record redirect to central portal:", error);
  }
}

export async function recordSubmissionStarted(params: {
  submitJobId: string;
  searchId?: string;
  fields: any;
  hasPhoto: boolean;
  hasDocument: boolean;
  hasDocumentBack: boolean;
}): Promise<void> {
  const p = prisma as any;
  try {
    let linkedSearchId = params.searchId || null;

    if (p.iccSubmission?.create) {
      if (!linkedSearchId && params.fields?.nationalIdNumber && p.verificationSearch?.findFirst) {
        const matchSearch = await p.verificationSearch.findFirst({
          where: { nid: params.fields.nationalIdNumber, matchFound: true },
          orderBy: { createdAt: "desc" },
        });
        if (matchSearch) linkedSearchId = matchSearch.id;
      }

      await p.iccSubmission.create({
        data: {
          submitJobId: params.submitJobId,
          searchId: linkedSearchId,
          status: "SUBMITTING",
          stage: "submitting",
          subscriberName: params.fields?.subscriberName || null,
          nationalIdNumber: params.fields?.nationalIdNumber || null,
          phoneNumber: params.fields?.phoneNumber || null,
          connection: params.fields?.connection || null,
          subscriberType: params.fields?.subscriberType || null,
          allFormFields: params.fields,
          userFilledFields: {
            phoneNumber: params.fields?.phoneNumber,
            validEmail: params.fields?.validEmail,
            connection: params.fields?.connection,
            subscriberType: params.fields?.subscriberType,
          },
          hasPhoto: params.hasPhoto,
          hasDocument: params.hasDocument,
          hasDocumentBack: params.hasDocumentBack,
        },
      });
      return;
    }

    // Direct PostgreSQL raw query
    const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await p.$executeRawUnsafe(
      `INSERT INTO "icc_submissions" ("id", "submitJobId", "searchId", "status", "stage", "subscriberName", "nationalIdNumber", "phoneNumber", "connection", "subscriberType", "allFormFields", "userFilledFields", "hasPhoto", "hasDocument", "hasDocumentBack", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, NOW(), NOW())`,
      id,
      params.submitJobId,
      linkedSearchId,
      "SUBMITTING",
      "submitting",
      params.fields?.subscriberName || null,
      params.fields?.nationalIdNumber || null,
      params.fields?.phoneNumber || null,
      params.fields?.connection || null,
      params.fields?.subscriberType || null,
      params.fields ? JSON.stringify(params.fields) : null,
      JSON.stringify({
        phoneNumber: params.fields?.phoneNumber,
        validEmail: params.fields?.validEmail,
        connection: params.fields?.connection,
        subscriberType: params.fields?.subscriberType,
      }),
      params.hasPhoto,
      params.hasDocument,
      params.hasDocumentBack
    );
  } catch (error) {
    console.error("[Audit DB] Failed to record submission started:", error);
  }
}

export async function recordSubmissionFinished(params: {
  submitJobId: string;
  status: "SUCCESS" | "FAILED";
  stage?: string;
  durationMs?: number;
  failureReason?: string;
}): Promise<void> {
  const p = prisma as any;
  try {
    if (p.iccSubmission?.updateMany) {
      await p.iccSubmission.updateMany({
        where: { submitJobId: params.submitJobId },
        data: {
          status: params.status,
          stage: params.stage || null,
          durationMs: params.durationMs || null,
          failureReason: params.failureReason || null,
        },
      });
      return;
    }

    await p.$executeRawUnsafe(
      `UPDATE "icc_submissions"
       SET "status" = $1, "stage" = $2, "durationMs" = $3, "failureReason" = $4, "updatedAt" = NOW()
       WHERE "submitJobId" = $5`,
      params.status,
      params.stage || null,
      params.durationMs || null,
      params.failureReason || null,
      params.submitJobId
    );
  } catch (error) {
    console.error("[Audit DB] Failed to record submission finished:", error);
  }
}

// ---------------------------------------------------------------------------
// Real Database Queries for Admin Panel
// ---------------------------------------------------------------------------

export async function getAdminDashboardStats() {
  const p = prisma as any;

  if (p.verificationSearch?.count) {
    const [
      totalSearches,
      matchedSearches,
      noMatchSearches,
      redirectedCount,
      totalSubmissions,
      successfulSubmissions,
      failedSubmissions,
      recentSearches,
      recentSubmissions,
    ] = await Promise.all([
      p.verificationSearch.count(),
      p.verificationSearch.count({ where: { matchFound: true } }),
      p.verificationSearch.count({ where: { matchFound: false } }),
      p.verificationSearch.count({ where: { redirectedToCentral: true } }),
      p.iccSubmission.count(),
      p.iccSubmission.count({ where: { status: "SUCCESS" } }),
      p.iccSubmission.count({ where: { status: "FAILED" } }),
      p.verificationSearch.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      p.iccSubmission.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

    return {
      totalSearches,
      matchedSearches,
      noMatchSearches,
      redirectedCount,
      totalSubmissions,
      successfulSubmissions,
      failedSubmissions,
      matchRate: totalSearches > 0 ? Math.round((matchedSearches / totalSearches) * 100) : 0,
      submissionSuccessRate:
        totalSubmissions > 0
          ? Math.round((successfulSubmissions / totalSubmissions) * 100)
          : 0,
      recentSearches,
      recentSubmissions,
    };
  }

  // Direct PostgreSQL queries
  const [
    totalSearchesRes,
    matchedSearchesRes,
    noMatchSearchesRes,
    redirectedCountRes,
    totalSubmissionsRes,
    successfulSubmissionsRes,
    failedSubmissionsRes,
    recentSearches,
    recentSubmissions,
  ]: any[] = await Promise.all([
    p.$queryRawUnsafe(`SELECT count(*)::int as count FROM "verification_searches"`),
    p.$queryRawUnsafe(`SELECT count(*)::int as count FROM "verification_searches" WHERE "matchFound" = true`),
    p.$queryRawUnsafe(`SELECT count(*)::int as count FROM "verification_searches" WHERE "matchFound" = false`),
    p.$queryRawUnsafe(`SELECT count(*)::int as count FROM "verification_searches" WHERE "redirectedToCentral" = true`),
    p.$queryRawUnsafe(`SELECT count(*)::int as count FROM "icc_submissions"`),
    p.$queryRawUnsafe(`SELECT count(*)::int as count FROM "icc_submissions" WHERE "status" = 'SUCCESS'`),
    p.$queryRawUnsafe(`SELECT count(*)::int as count FROM "icc_submissions" WHERE "status" = 'FAILED'`),
    p.$queryRawUnsafe(`SELECT * FROM "verification_searches" ORDER BY "createdAt" DESC LIMIT 6`),
    p.$queryRawUnsafe(`SELECT * FROM "icc_submissions" ORDER BY "createdAt" DESC LIMIT 6`),
  ]);

  const totalSearches = totalSearchesRes?.[0]?.count ?? 0;
  const matchedSearches = matchedSearchesRes?.[0]?.count ?? 0;
  const noMatchSearches = noMatchSearchesRes?.[0]?.count ?? 0;
  const redirectedCount = redirectedCountRes?.[0]?.count ?? 0;
  const totalSubmissions = totalSubmissionsRes?.[0]?.count ?? 0;
  const successfulSubmissions = successfulSubmissionsRes?.[0]?.count ?? 0;
  const failedSubmissions = failedSubmissionsRes?.[0]?.count ?? 0;

  return {
    totalSearches,
    matchedSearches,
    noMatchSearches,
    redirectedCount,
    totalSubmissions,
    successfulSubmissions,
    failedSubmissions,
    matchRate: totalSearches > 0 ? Math.round((matchedSearches / totalSearches) * 100) : 0,
    submissionSuccessRate:
      totalSubmissions > 0
        ? Math.round((successfulSubmissions / totalSubmissions) * 100)
        : 0,
    recentSearches: recentSearches || [],
    recentSubmissions: recentSubmissions || [],
  };
}

export async function getAllSearches(filter?: { status?: string; query?: string }) {
  const p = prisma as any;

  if (p.verificationSearch?.findMany) {
    const where: any = {};
    if (filter?.status && filter.status !== "ALL") {
      if (filter.status === "REDIRECTED") {
        where.redirectedToCentral = true;
      } else if (filter.status === "MATCHED") {
        where.matchFound = true;
      } else if (filter.status === "NO_MATCH") {
        where.matchFound = false;
        where.status = { not: "PENDING" };
      } else {
        where.status = filter.status;
      }
    }

    if (filter?.query && filter.query.trim()) {
      const q = filter.query.trim();
      where.OR = [
        { nid: { contains: q, mode: "insensitive" } },
        { dob: { contains: q, mode: "insensitive" } },
      ];
    }

    return p.verificationSearch.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  // Direct PostgreSQL query
  let sql = `SELECT * FROM "verification_searches" WHERE 1=1`;
  const sqlParams: any[] = [];
  let paramIdx = 1;

  if (filter?.status && filter.status !== "ALL") {
    if (filter.status === "REDIRECTED") {
      sql += ` AND "redirectedToCentral" = true`;
    } else if (filter.status === "MATCHED") {
      sql += ` AND "matchFound" = true`;
    } else if (filter.status === "NO_MATCH") {
      sql += ` AND "matchFound" = false AND "status" != 'PENDING'`;
    } else {
      sql += ` AND "status" = $${paramIdx++}`;
      sqlParams.push(filter.status);
    }
  }

  if (filter?.query && filter.query.trim()) {
    sql += ` AND ("nid" ILIKE $${paramIdx} OR "dob" ILIKE $${paramIdx})`;
    sqlParams.push(`%${filter.query.trim()}%`);
    paramIdx++;
  }

  sql += ` ORDER BY "createdAt" DESC`;

  return p.$queryRawUnsafe(sql, ...sqlParams);
}

export async function getAllSubmissions(filter?: { status?: string; query?: string }) {
  const p = prisma as any;

  if (p.iccSubmission?.findMany) {
    const where: any = {};
    if (filter?.status && filter.status !== "ALL") {
      where.status = filter.status;
    }
    if (filter?.query && filter.query.trim()) {
      const q = filter.query.trim();
      where.OR = [
        { nationalIdNumber: { contains: q, mode: "insensitive" } },
        { subscriberName: { contains: q, mode: "insensitive" } },
        { phoneNumber: { contains: q, mode: "insensitive" } },
      ];
    }
    return p.iccSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  // Direct PostgreSQL query
  let sql = `SELECT * FROM "icc_submissions" WHERE 1=1`;
  const sqlParams: any[] = [];
  let paramIdx = 1;

  if (filter?.status && filter.status !== "ALL") {
    sql += ` AND "status" = $${paramIdx++}`;
    sqlParams.push(filter.status);
  }

  if (filter?.query && filter.query.trim()) {
    sql += ` AND ("nationalIdNumber" ILIKE $${paramIdx} OR "subscriberName" ILIKE $${paramIdx} OR "phoneNumber" ILIKE $${paramIdx})`;
    sqlParams.push(`%${filter.query.trim()}%`);
    paramIdx++;
  }

  sql += ` ORDER BY "createdAt" DESC`;

  return p.$queryRawUnsafe(sql, ...sqlParams);
}
