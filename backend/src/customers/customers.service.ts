import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async getCustomers(query: any) {
    const p = this.prisma as any;
    const page = query.page ? parseInt(query.page) : 1;
    const limit = query.limit ? parseInt(query.limit) : 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phoneNumber: { contains: query.search } },
      ];
    }

    const [total, rows] = await Promise.all([
      p.customer.count({ where }),
      p.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { numbers: true, orders: true, wallets: true } },
        },
      }),
    ]);

    return { total, rows, customers: rows, page, pageSize: limit, pages: Math.ceil(total / limit) };
  }

  async getCustomerById(id: string) {
    const p = this.prisma as any;
    const customer = await p.customer.findUnique({
      where: { id },
      include: {
        numbers: {
          include: { displayCompany: true, wallet: true },
          orderBy: { createdAt: 'desc' },
        },
        wallets: {
          include: { number: true },
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          include: { items: { include: { number: true } }, payments: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async updateCustomer(id: string, body: any) {
    const p = this.prisma as any;
    const allowed = ['fullName', 'email', 'phoneNumber', 'customerType', 'companyName', 'companyPosition', 'isActive', 'notes'];
    const data: any = {};
    for (const k of allowed) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    return await p.customer.update({ where: { id }, data });
  }
}
