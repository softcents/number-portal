import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    const p = this.prisma as any;
    const [
      totalSearches,
      matchedSearches,
      iccSubmissions,
      totalNumbers,
      availableNumbers,
      reservedNumbers,
      activeNumbers,
      blockedNumbers,
      totalOrders,
      paidOrders,
      revenue,
      totalProviders,
      activeProviders,
      totalCustomers,
      totalWallets,
      recentSearches,
      recentSubmissions,
    ] = await Promise.all([
      p.verificationSearch.count(),
      p.verificationSearch.count({ where: { matchFound: true } }),
      p.iccSubmission.count(),
      p.number.count(),
      p.number.count({ where: { status: 'AVAILABLE' } }),
      p.number.count({ where: { status: 'RESERVED' } }),
      p.number.count({ where: { status: 'ACTIVE' } }),
      p.number.count({ where: { status: 'BLOCKED' } }),
      p.order.count(),
      p.order.count({ where: { status: { in: ['PAID', 'COMPLETED'] } } }),
      p.order.aggregate({ where: { status: { in: ['PAID', 'COMPLETED'] } }, _sum: { totalAmount: true } }),
      p.provider.count(),
      p.provider.count({ where: { isActive: true } }),
      p.customer.count({ where: { isActive: true } }),
      p.numberWallet.count(),
      p.verificationSearch.findMany({ take: 5, orderBy: { createdAt: 'desc' } }),
      p.iccSubmission.findMany({ take: 5, orderBy: { createdAt: 'desc' } }),
    ]);

    const matchRate = totalSearches > 0 ? Math.round((matchedSearches / totalSearches) * 100) : 0;

    return {
      totalSearches,
      matchedSearches,
      noMatchSearches: Math.max(0, totalSearches - matchedSearches),
      matchRate,
      totalSubmissions: iccSubmissions,
      recentSearches,
      recentSubmissions,
      verification: {
        totalSearches,
        matchedSearches,
        iccSubmissions,
      },
      numberSale: {
        totalNumbers,
        availableNumbers,
        reservedNumbers,
        activeNumbers,
        blockedNumbers,
        totalOrders,
        paidOrders,
        completedOrders: paidOrders,
        totalRevenue: Number(revenue._sum.totalAmount || 0),
        activeProviders,
        totalProviders,
        totalWallets,
        totalCustomers,
      },
    };
  }

  async getAuditLogs(query: any) {
    const p = this.prisma as any;
    const page = query.page ? parseInt(query.page) : 1;
    const limit = query.limit ? parseInt(query.limit) : 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.action) where.action = query.action;
    if (query.resource) where.resource = query.resource;

    const [total, rows] = await Promise.all([
      p.systemAuditLog.count({ where }),
      p.systemAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { total, rows, page, limit, pages: Math.ceil(total / limit) };
  }
}
