import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { WalletsService } from '../wallets/wallets.service';
import { ActivationService } from './activation.service';

export function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ORD-${dateStr}-${randomPart}`;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallets: WalletsService,
    private readonly activationService: ActivationService,
  ) {}

  // ─── 1. Create Order & Atomically Reserve Numbers ──────────────────────────
  async createOrder(params: {
    customerId: string;
    numberIds: string[];
    notes?: string;
    reservationMinutes?: number;
    actorId?: string;
    ipAddress?: string;
  }) {
    const {
      customerId,
      numberIds,
      notes,
      reservationMinutes = 15,
      actorId = 'system',
      ipAddress,
    } = params;

    if (!numberIds || numberIds.length === 0) {
      throw new BadRequestException('At least one number must be specified');
    }

    const p = this.prisma as any;

    const result = await p.$transaction(async (tx: any) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, fullName: true, email: true, isActive: true },
      });

      if (!customer) throw new NotFoundException('Customer not found');
      if (!customer.isActive) throw new BadRequestException('Customer account is inactive');

      const numbers = await tx.number.findMany({
        where: { id: { in: numberIds } },
        select: { id: true, number: true, status: true, salePrice: true },
      });

      if (numbers.length !== numberIds.length) {
        throw new BadRequestException('One or more selected numbers could not be found');
      }

      const unavailable = numbers.filter((n: any) => n.status !== 'AVAILABLE');
      if (unavailable.length > 0) {
        const numbersList = unavailable.map((n: any) => n.number).join(', ');
        throw new BadRequestException(`The following numbers are no longer available: ${numbersList}`);
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + reservationMinutes * 60 * 1000);

      let totalAmount = 0;
      for (const num of numbers) {
        totalAmount += num.salePrice ? Number(num.salePrice) : 0;
      }

      const orderNumber = generateOrderNumber();

      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          status: 'PENDING',
          totalAmount,
          currency: 'BDT',
          notes: notes || null,
          expiresAt,
        },
      });

      for (const num of numbers) {
        const price = num.salePrice ? Number(num.salePrice) : 0;
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            numberId: num.id,
            salePrice: price,
            status: 'RESERVED',
          },
        });

        await tx.number.update({
          where: { id: num.id },
          data: {
            status: 'RESERVED',
            reservedAt: now,
            reservationExpiresAt: expiresAt,
            reservedBy: customerId,
            updatedAt: now,
          },
        });

        await tx.numberStatusHistory.create({
          data: {
            numberId: num.id,
            fromStatus: 'AVAILABLE',
            toStatus: 'RESERVED',
            changedBy: actorId,
            reason: `Reserved by Order ${orderNumber}`,
            source: 'system',
            ipAddress: ipAddress || null,
          },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: 'PENDING',
          changedBy: actorId,
          reason: 'Order created, numbers reserved',
        },
      });

      return { order, numbersCount: numbers.length, expiresAt };
    });

    await this.audit.writeAudit({
      actorType: 'customer',
      actorId: customerId,
      action: 'CREATE_ORDER',
      resource: 'order',
      resourceId: result.order.id,
      newValue: { orderNumber: result.order.orderNumber, totalAmount: result.order.totalAmount, numberIds },
      ipAddress,
    });

    return result;
  }

  // ─── 2. Cancel Order & Release Reserved Numbers ────────────────────────────
  async cancelOrder(params: {
    orderId: string;
    actorId: string;
    reason?: string;
    ipAddress?: string;
  }) {
    const { orderId, actorId, reason = 'Order cancelled', ipAddress } = params;
    const p = this.prisma as any;

    const result = await p.$transaction(async (tx: any) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { number: true } } },
      });

      if (!order) throw new NotFoundException('Order not found');
      if (order.status === 'PAID') throw new BadRequestException('Cannot cancel an already completed and paid order');
      if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
        return { order, alreadyCancelled: true };
      }

      const now = new Date();

      for (const item of order.items) {
        if (item.number && item.number.status === 'RESERVED') {
          await tx.number.update({
            where: { id: item.number.id },
            data: {
              status: 'AVAILABLE',
              reservedAt: null,
              reservationExpiresAt: null,
              reservedBy: null,
              updatedAt: now,
            },
          });

          await tx.numberStatusHistory.create({
            data: {
              numberId: item.number.id,
              fromStatus: 'RESERVED',
              toStatus: 'AVAILABLE',
              changedBy: actorId,
              reason: `Order ${order.orderNumber} cancelled: ${reason}`,
              source: 'system',
              ipAddress: ipAddress || null,
            },
          });
        }

        await tx.orderItem.update({
          where: { id: item.id },
          data: { status: 'CANCELLED' },
        });
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', updatedAt: now },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: 'CANCELLED',
          changedBy: actorId,
          reason,
        },
      });

      return { order: updatedOrder, releasedCount: order.items.length };
    });

    return result;
  }

  // ─── 3. Complete Order Upon Verified Payment ───────────────────────────────
  async completeOrder(params: {
    orderId: string;
    paymentId: string;
    actorId?: string;
    ipAddress?: string;
  }) {
    const { orderId, paymentId, actorId = 'system', ipAddress } = params;
    const p = this.prisma as any;

    const result = await p.$transaction(async (tx: any) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { customer: true, items: { include: { number: true } } },
      });

      if (!order) throw new NotFoundException('Order not found');
      if (order.status === 'PAID') return { order, alreadyPaid: true };

      const now = new Date();

      for (const item of order.items) {
        if (item.number) {
          // Set to PROCESSING (Activation is handled asynchronously via ActivationService)
          await tx.number.update({
            where: { id: item.number.id },
            data: {
              status: 'PROCESSING',
              customerId: order.customerId,
              reservedAt: null,
              reservationExpiresAt: null,
              reservedBy: null,
              activationStatus: 'PROCESSING',
              updatedAt: now,
            },
          });

          await tx.numberStatusHistory.create({
            data: {
              numberId: item.number.id,
              fromStatus: item.number.status,
              toStatus: 'PROCESSING',
              changedBy: actorId,
              reason: `Order ${order.orderNumber} paid via payment ${paymentId}; queuing provider activation`,
              source: 'system',
              ipAddress: ipAddress || null,
            },
          });
        }

        await tx.orderItem.update({
          where: { id: item.id },
          data: { status: 'PROCESSING', updatedAt: now },
        });
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: 'PAID', updatedAt: now },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: 'PAID',
          changedBy: actorId,
          reason: `Payment verified (${paymentId}); queued for activation`,
        },
      });

      return { order: updatedOrder, items: order.items, itemsCount: order.items.length };
    });

    await this.audit.writeAudit({
      actorType: 'system',
      actorId,
      action: 'COMPLETE_ORDER_PAYMENT',
      resource: 'order',
      resourceId: orderId,
      newValue: { paymentId, status: 'PAID' },
      ipAddress,
    });

    // Trigger independent provider activation for each item
    if (result.items && result.items.length > 0) {
      for (const item of result.items) {
        this.activationService.activateOrderItem(item.id, actorId).catch(() => {});
      }
    }

    return result;
  }

  // ─── 4. Expire Stale Pending Orders ────────────────────────────────────────
  async expireStaleOrders() {
    const p = this.prisma as any;
    const now = new Date();

    const staleOrders = await p.order.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      select: { id: true, orderNumber: true },
    });

    const expiredIds: string[] = [];
    for (const ord of staleOrders) {
      try {
        await this.cancelOrder({
          orderId: ord.id,
          actorId: 'system_cron',
          reason: 'Reservation TTL expired',
        });
        expiredIds.push(ord.id);
      } catch (e: any) {
        console.error(`Failed to expire order ${ord.orderNumber}:`, e?.message);
      }
    }

    return { expiredCount: expiredIds.length, expiredIds };
  }

  // ─── 5. Fetch Orders with Filtering ────────────────────────────────────────
  async getOrders(params: {
    status?: string;
    customerId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, customerId, search, page = 1, limit = 20 } = params;
    const p = this.prisma as any;

    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    if (customerId) where.customerId = customerId;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customer: { fullName: { contains: search, mode: 'insensitive' } } },
        { customer: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const skip = (page - 1) * limit;

    const [total, orders, counts, revenue] = await Promise.all([
      p.order.count({ where }),
      p.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, fullName: true, email: true, phoneNumber: true } },
          items: {
            include: {
              number: {
                select: { id: true, number: true, displayCompany: true },
              },
            },
          },
          payments: {
            select: { id: true, gateway: true, amount: true, status: true, paidAt: true, gatewayTransactionId: true },
          },
        },
      }),
      p.order.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      p.order.aggregate({
        where: { status: 'PAID' },
        _sum: { totalAmount: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const c of counts) {
      statusCounts[c.status] = c._count.id;
    }

    return {
      success: true,
      orders,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      metrics: {
        totalOrders: total,
        statusCounts,
        totalRevenue: Number(revenue._sum.totalAmount || 0),
      },
    };
  }

  async getOrderById(id: string) {
    const p = this.prisma as any;
    const order = await p.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          include: {
            number: {
              include: {
                provider: true,
                displayCompany: true,
                wallet: true,
              },
            },
          },
        },
        payments: {
          include: { auditLogs: { orderBy: { createdAt: 'desc' } } },
        },
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async markPaid(orderId: string, notes?: string, transactionReference?: string, actorId = 'admin', ipAddress?: string) {
    const p = this.prisma as any;
    const order = await p.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'PAID') throw new BadRequestException('Order is already marked as paid');

    const payment = await p.payment.create({
      data: {
        customerId: order.customerId,
        orderId: order.id,
        gateway: 'MANUAL_ADMIN',
        gatewayTransactionId: transactionReference || `MANUAL-${Date.now()}`,
        amount: order.totalAmount,
        currency: order.currency,
        status: 'COMPLETED',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        paidAt: new Date(),
        notes: notes || 'Admin manual verification',
      },
    });

    const result = await this.completeOrder({
      orderId: order.id,
      paymentId: payment.id,
      actorId,
      ipAddress,
    });

    return { success: true, message: 'Order marked paid and activation initiated', paymentId: payment.id, result };
  }

  async retryItemActivation(orderItemId: string, adminId: string) {
    return await this.activationService.retryActivation(orderItemId, adminId);
  }

  async completeFreeOrder(orderId: string, actorId: string = 'customer', ipAddress?: string) {
    const p = this.prisma as any;
    const order = await p.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'PAID') return { success: true, alreadyPaid: true, orderId };
    if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
      throw new BadRequestException(`Order is ${order.status.toLowerCase()} and cannot be completed`);
    }

    const totalAmount = Number(order.totalAmount ?? 0);
    if (totalAmount > 0) {
      throw new BadRequestException('This order is not free. Please use the PipraPay payment gateway.');
    }

    const freePayment = await p.payment.create({
      data: {
        customerId: order.customerId,
        orderId: order.id,
        gateway: 'FREE',
        amount: 0,
        currency: 'BDT',
        status: 'COMPLETED',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        paidAt: new Date(),
        gatewayTransactionId: `FREE-${orderId}-${Date.now()}`,
        notes: 'Zero-cost number — instant assignment without gateway',
      },
    });

    await p.paymentAuditLog.create({
      data: {
        paymentId: freePayment.id,
        oldStatus: null,
        newStatus: 'COMPLETED',
        oldAmount: null,
        newAmount: 0,
        action: 'FREE_ORDER_COMPLETE',
        reason: 'Number price is ৳0 — instant assignment without gateway',
        ipAddress: ipAddress || null,
      },
    });

    const result = await this.completeOrder({
      orderId,
      paymentId: freePayment.id,
      actorId,
      ipAddress,
    });

    return {
      success: true,
      orderId,
      paymentId: freePayment.id,
      message: 'Free number assigned successfully.',
      result,
    };
  }
}
