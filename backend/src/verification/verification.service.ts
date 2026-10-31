import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly workerUrl: string;
  private readonly workerSecret: string;

  constructor(private readonly prisma: PrismaService) {
    this.workerUrl = process.env.WORKER_URL || 'http://127.0.0.1:8001';
    this.workerSecret = process.env.WORKER_SECRET || '5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a';
  }

  async createSearch(nid: string, dob: string, ipAddress?: string) {
    const p = this.prisma as any;
    const search = await p.verificationSearch.create({
      data: {
        nid: nid.trim(),
        dob: dob.trim(),
        status: 'PROCESSING',
        ipAddress: ipAddress || null,
      },
    });

    // Forward to Python worker in background
    this.forwardToWorker(search.id, nid, dob).catch((err) =>
      this.logger.error(`Forwarding to worker failed: ${err?.message}`),
    );

    return search;
  }

  private async forwardToWorker(searchId: string, nid: string, dob: string) {
    const p = this.prisma as any;
    try {
      const res = await fetch(`${this.workerUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Secret': this.workerSecret,
        },
        body: JSON.stringify({ nid, dob, search_id: searchId }),
      });

      if (res.ok) {
        const data = await res.json();
        await p.verificationSearch.update({
          where: { id: searchId },
          data: {
            status: data.status || 'MATCHED',
            matchFound: data.match_found ?? true,
            matchedProfile: data.profile || null,
            jobId: data.job_id || null,
          },
        });
      }
    } catch (err: any) {
      await p.verificationSearch.update({
        where: { id: searchId },
        data: { status: 'FAILED', errorMessage: err?.message },
      });
    }
  }

  async getSearchById(id: string) {
    const p = this.prisma as any;
    return await p.verificationSearch.findUnique({ where: { id }, include: { submissions: true } });
  }

  async getSearches(query: any) {
    const p = this.prisma as any;
    const page = query.page ? parseInt(query.page) : 1;
    const limit = query.limit ? parseInt(query.limit) : 50;
    const skip = (page - 1) * limit;

    const [total, rows] = await Promise.all([
      p.verificationSearch.count(),
      p.verificationSearch.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { total, rows, page, limit, pages: Math.ceil(total / limit) };
  }

  async submitIcc(body: any) {
    const p = this.prisma as any;
    const sub = await p.iccSubmission.create({
      data: {
        searchId: body.searchId || null,
        status: 'SUBMITTED',
        subscriberName: body.subscriberName || null,
        nationalIdNumber: body.nationalIdNumber || null,
        phoneNumber: body.phoneNumber || null,
        allFormFields: body.allFormFields || null,
      },
    });
    return { success: true, submissionId: sub.id };
  }

  async getSubmissions(query: any) {
    const p = this.prisma as any;
    const page = query.page ? parseInt(query.page) : 1;
    const limit = query.limit ? parseInt(query.limit) : 50;
    const skip = (page - 1) * limit;

    const [total, rows] = await Promise.all([
      p.iccSubmission.count(),
      p.iccSubmission.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { total, rows, page, limit, pages: Math.ceil(total / limit) };
  }
}
