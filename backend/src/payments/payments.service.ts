import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { WalletsService } from '../wallets/wallets.service';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly isSandbox: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly wallets: WalletsService,
  ) {
    this.apiKey = process.env.PIPRAPAY_API_KEY || 'b3e91bb98e0d874acb860272f240000b48a47368010ed81017';
    this.apiSecret = process.env.PIPRAPAY_API_SECRET || '';
    this.baseUrl = process.env.PIPRAPAY_BASE_URL || 'https://epay.softcents.com/api';
    this.isSandbox = false;
  }

  // ─── 1. Initiate Checkout Session ──────────────────────────────────────────
  async createCheckoutSession(params: {
    customerId: string;
    orderId?: string;
    rechargeOrderId?: string;
    amount: number;
    currency?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    ipAddress?: string;
  }) {
    const { customerId, orderId, rechargeOrderId, amount, currency = 'BDT', customerName, customerEmail, customerPhone, ipAddress } = params;

    const p = this.prisma as any;

    // Special case: 0 BDT order is free — complete immediately without payment gateway!
    if (orderId && (!amount || amount <= 0)) {
      const freePayment = await p.payment.create({
        data: {
          customerId,
          orderId,
          gateway: 'FREE',
          amount: 0,
          currency,
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
          reason: 'Order price is ৳0 BDT — instant claim without gateway',
          ipAddress: ipAddress || null,
        },
      });

      await this.orders.completeOrder({
        orderId,
        paymentId: freePayment.id,
        actorId: customerId,
        ipAddress,
      });

      return {
        success: true,
        isFree: true,
        orderId,
        paymentId: freePayment.id,
        message: 'Free number claimed successfully',
      };
    }

    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const idempotencyKey = crypto.randomUUID();

    const payment = await p.payment.create({
      data: {
        customerId,
        orderId: orderId || null,
        rechargeOrderId: rechargeOrderId || null,
        gateway: 'PIPRAPAY',
        amount,
        currency,
        status: 'PENDING',
        verificationStatus: 'UNVERIFIED',
        idempotencyKey,
      },
    });

    await p.paymentAuditLog.create({
      data: {
        paymentId: payment.id,
        oldStatus: null,
        newStatus: 'PENDING',
        oldAmount: null,
        newAmount: amount,
        action: 'INITIATE_PAYMENT',
        reason: orderId ? `Checkout for order ${orderId}` : 'Wallet recharge checkout',
        ipAddress: ipAddress || null,
        metadata: { gateway: 'PIPRAPAY', isSandbox: false, orderId, rechargeOrderId },
      },
    });

    // Real Live Gateway Request — epay / PipraPay Integration
    try {
      const frontendHost = process.env.FRONTEND_URL || 'https://iptsp-panel.softcents.com';
      const chargePayload = {
        full_name: customerName || 'Valued Customer',
        email_address: customerEmail || 'customer@softcents.com',
        mobile_number: customerPhone || '01700000000',
        amount: amount.toFixed(2),
        currency,
        metadata: JSON.stringify({
          payment_id: payment.id,
          order_id: orderId || null,
          recharge_order_id: rechargeOrderId || null,
          customer_id: customerId,
        }),
        return_url: `${frontendHost}/portal?payment=success&paymentId=${payment.id}`,
        webhook_url: `${frontendHost}/api/payments/webhook`,
      };

      const res = await fetch(`${this.baseUrl}/checkout/redirect`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'MHS-PIPRAPAY-API-KEY': this.apiKey,
          'mh-piprapay-api-key': this.apiKey,
        },
        body: JSON.stringify(chargePayload),
      });

      const resText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(resText);
      } catch {
        data = null;
      }

      if (!res.ok || data?.status === false || data?.status === 'error' || data?.error) {
        throw new Error(data?.message || data?.error?.message || `PipraPay rejected request HTTP ${res.status}`);
      }

      const gatewayPaymentId = data?.pp_id || data?.invoice_id || data?.payment_id || null;
      const paymentUrl = data?.pp_url || data?.payment_url || data?.url || `${this.baseUrl}/checkout/redirect?invoice_id=${gatewayPaymentId}`;

      await p.payment.update({
        where: { id: payment.id },
        data: { gatewayPaymentId, rawResponse: data },
      });

      return {
        success: true,
        paymentId: payment.id,
        gatewayPaymentId,
        paymentUrl,
        isSandbox: false,
        amount,
        currency,
      };
    } catch (err: any) {
      await p.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failedAt: new Date(), notes: err?.message },
      });
      throw err;
    }
  }

  // ─── 2. Settle Successful Payment (Idempotent) ─────────────────────────────
  async processPaymentSuccess(params: {
    paymentId: string;
    gatewayTransactionId?: string;
    rawResponse?: any;
    actorId?: string;
    ipAddress?: string;
  }) {
    const { paymentId, gatewayTransactionId = `TXN-${Date.now()}`, rawResponse, actorId = 'piprapay_webhook', ipAddress } = params;
    const p = this.prisma as any;

    const payment = await p.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) throw new NotFoundException('Payment record not found');
    if (payment.status === 'COMPLETED') {
      return { success: true, alreadyProcessed: true, paymentId: payment.id };
    }

    const now = new Date();

    await p.$transaction(async (tx: any) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'COMPLETED',
          verificationStatus: 'VERIFIED',
          verifiedAt: now,
          paidAt: now,
          gatewayTransactionId,
          rawResponse: rawResponse || null,
          updatedAt: now,
        },
      });

      await tx.paymentAuditLog.create({
        data: {
          paymentId,
          oldStatus: payment.status,
          newStatus: 'COMPLETED',
          oldAmount: payment.amount,
          newAmount: payment.amount,
          action: 'PAYMENT_CONFIRMED',
          reason: 'Gateway verified payment success',
          ipAddress: ipAddress || null,
          metadata: { gatewayTransactionId, rawResponse },
        },
      });
    });

    // Post-payment triggers:
    if (payment.orderId) {
      await this.orders.completeOrder({
        orderId: payment.orderId,
        paymentId: payment.id,
        actorId,
        ipAddress,
      });
    }

    if (payment.walletId) {
      await this.wallets.creditWallet({
        walletId: payment.walletId,
        amount: Number(payment.amount),
        transactionType: 'RECHARGE',
        reference: gatewayTransactionId,
        paymentId: payment.id,
        notes: 'Online recharge via PipraPay',
        actorId,
      });
    }

    return {
      success: true,
      paymentId: payment.id,
      orderId: payment.orderId,
      walletId: payment.walletId,
      status: 'COMPLETED',
    };
  }

  // ─── 3. Settle Failed Payment ──────────────────────────────────────────────
  async processPaymentFailure(params: {
    paymentId: string;
    reason?: string;
    rawResponse?: any;
    ipAddress?: string;
  }) {
    const { paymentId, reason = 'Payment failed', rawResponse, ipAddress } = params;
    const p = this.prisma as any;

    const payment = await p.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment record not found');
    if (payment.status === 'COMPLETED') throw new BadRequestException('Cannot fail completed payment');

    const now = new Date();

    await p.$transaction(async (tx: any) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'FAILED', failedAt: now, notes: reason, rawResponse: rawResponse || null },
      });

      await tx.paymentAuditLog.create({
        data: {
          paymentId,
          oldStatus: payment.status,
          newStatus: 'FAILED',
          oldAmount: payment.amount,
          newAmount: payment.amount,
          action: 'PAYMENT_FAILED',
          reason,
          ipAddress: ipAddress || null,
          metadata: { rawResponse },
        },
      });
    });

    return { success: true, paymentId, status: 'FAILED' };
  }

  // ─── 4. Verify Webhook API Key ─────────────────────────────────────────────
  verifyWebhook(apiKeyOrHeader?: string): boolean {
    if (!apiKeyOrHeader) return false;
    try {
      const a = Buffer.from(apiKeyOrHeader);
      const b = Buffer.from(this.apiKey);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async getPayments(query: any) {
    const p = this.prisma as any;
    const page = query.page ? parseInt(query.page) : 1;
    const limit = query.limit ? parseInt(query.limit) : 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status && query.status !== 'ALL') where.status = query.status;

    const [total, payments, stats] = await Promise.all([
      p.payment.count({ where }),
      p.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { id: true, orderNumber: true, totalAmount: true } },
          auditLogs: { take: 3, orderBy: { createdAt: 'desc' } },
        },
      }),
      p.payment.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    return { total, payments, stats, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPaymentById(id: string) {
    const p = this.prisma as any;
    const payment = await p.payment.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, orderNumber: true, status: true } },
        auditLogs: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  // ─── Admin Manual Payment Audit & Status Update (Section 39, 42) ───────────
  async updatePaymentStatusByAdmin(params: {
    paymentId: string;
    newStatus: string;
    reason: string;
    notes?: string;
    adminId: string;
    ipAddress?: string;
  }) {
    const { paymentId, newStatus, reason, notes, adminId, ipAddress } = params;
    const p = this.prisma as any;
    const payment = await p.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    const now = new Date();
    await p.$transaction(async (tx: any) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: newStatus,
          notes: notes ? `${payment.notes ? payment.notes + '; ' : ''}${notes}` : payment.notes,
          ...(newStatus === 'COMPLETED' ? { verifiedAt: now, paidAt: now, verificationStatus: 'VERIFIED' } : {}),
          ...(newStatus === 'FAILED' ? { failedAt: now } : {}),
          ...(newStatus === 'REFUNDED' ? { refundedAt: now } : {}),
          updatedAt: now,
        },
      });

      await tx.paymentAuditLog.create({
        data: {
          paymentId,
          oldStatus: payment.status,
          newStatus,
          oldAmount: payment.amount,
          newAmount: payment.amount,
          action: 'ADMIN_MANUAL_STATUS_UPDATE',
          reason,
          adminId,
          ipAddress: ipAddress || null,
          metadata: { notes },
        },
      });
    });

    if (newStatus === 'COMPLETED' && payment.status !== 'COMPLETED') {
      if (payment.orderId) {
        await this.orders.completeOrder({
          orderId: payment.orderId,
          paymentId,
          actorId: adminId,
          ipAddress,
        });
      }
      if (payment.walletId) {
        await this.wallets.creditWallet({
          walletId: payment.walletId,
          amount: Number(payment.amount),
          transactionType: 'RECHARGE',
          reference: `ADMIN-${Date.now()}`,
          paymentId,
          notes: `Admin manually approved recharge: ${reason}`,
          actorId: adminId,
        });
      }
    }

    return await this.getPaymentById(paymentId);
  }
}
