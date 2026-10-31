import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createWalletForNumber(params: { numberId: string; customerId: string; adminId?: string }) {
    const { numberId, customerId, adminId } = params;
    const p = this.prisma as any;

    const existing = await p.numberWallet.findUnique({ where: { numberId } });
    if (existing) return { success: true, walletId: existing.id };

    const wallet = await p.numberWallet.create({
      data: {
        numberId,
        customerId,
        balance: 0,
        currency: 'BDT',
        status: 'ACTIVE',
      },
    });

    if (adminId) {
      await this.audit.writeAudit({
        actorType: 'admin',
        actorId: adminId,
        action: 'CREATE_WALLET',
        resource: 'wallet',
        resourceId: wallet.id,
        newValue: { numberId, customerId, balance: 0 },
      });
    }

    return { success: true, walletId: wallet.id };
  }

  async creditWallet(params: {
    walletId: string;
    amount: number;
    transactionType?: string;
    reference?: string;
    paymentId?: string;
    notes?: string;
    actorId: string;
  }) {
    const { walletId, amount, transactionType = 'CREDIT', reference, paymentId, notes, actorId } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const p = this.prisma as any;

    // Concurrency-safe atomic transaction
    const result = await p.$transaction(async (tx: any) => {
      const wallet = await tx.numberWallet.findUnique({
        where: { id: walletId },
        select: { id: true, balance: true, status: true, numberId: true, customerId: true },
      });

      if (!wallet) throw new NotFoundException('Wallet not found');
      if (wallet.status === 'CLOSED') throw new BadRequestException('Wallet is closed');
      if (wallet.status === 'LOCKED') throw new BadRequestException('Wallet is locked');

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + amount;

      await tx.numberWallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter, updatedAt: new Date() },
      });

      const transaction = await tx.numberWalletTransaction.create({
        data: {
          walletId,
          numberId: wallet.numberId,
          customerId: wallet.customerId,
          transactionType,
          amount,
          balanceBefore,
          balanceAfter,
          reference: reference || null,
          paymentId: paymentId || null,
          status: 'COMPLETED',
          notes: notes || null,
        },
      });

      return { balanceBefore, balanceAfter, transactionId: transaction.id };
    });

    await this.audit.writeAudit({
      actorType: 'system',
      actorId,
      action: 'CREDIT_WALLET',
      resource: 'wallet',
      resourceId: walletId,
      newValue: { amount, balanceAfter: result.balanceAfter },
    });

    return { success: true, ...result };
  }

  async debitWallet(params: {
    walletId: string;
    amount: number;
    transactionType?: string;
    reference?: string;
    notes?: string;
    actorId: string;
  }) {
    const { walletId, amount, transactionType = 'DEBIT', reference, notes, actorId } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const p = this.prisma as any;

    const result = await p.$transaction(async (tx: any) => {
      const wallet = await tx.numberWallet.findUnique({
        where: { id: walletId },
        select: { id: true, balance: true, status: true, numberId: true, customerId: true },
      });

      if (!wallet) throw new NotFoundException('Wallet not found');
      if (wallet.status !== 'ACTIVE') throw new BadRequestException(`Cannot debit wallet with status ${wallet.status}`);

      const balanceBefore = Number(wallet.balance);
      if (balanceBefore < amount) {
        throw new BadRequestException(`Insufficient balance: current ${balanceBefore} BDT, required ${amount} BDT`);
      }

      const balanceAfter = balanceBefore - amount;

      await tx.numberWallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter, updatedAt: new Date() },
      });

      const transaction = await tx.numberWalletTransaction.create({
        data: {
          walletId,
          numberId: wallet.numberId,
          customerId: wallet.customerId,
          transactionType,
          amount,
          balanceBefore,
          balanceAfter,
          reference: reference || null,
          status: 'COMPLETED',
          notes: notes || null,
        },
      });

      return { balanceBefore, balanceAfter, transactionId: transaction.id };
    });

    return { success: true, ...result };
  }

  async getWallets(query: any) {
    const p = this.prisma as any;
    const page = query.page ? parseInt(query.page) : 1;
    const limit = query.limit ? parseInt(query.limit) : 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.status && query.status !== 'ALL') where.status = query.status;

    const [total, wallets] = await Promise.all([
      p.numberWallet.count({ where }),
      p.numberWallet.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          number: { select: { id: true, number: true, displayCompany: true } },
          customer: { select: { id: true, fullName: true, email: true } },
          transactions: { take: 5, orderBy: { createdAt: 'desc' } },
        },
      }),
    ]);

    return { total, wallets, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getWalletById(id: string) {
    const p = this.prisma as any;
    const wallet = await p.numberWallet.findUnique({
      where: { id },
      include: {
        number: true,
        customer: true,
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }
}
