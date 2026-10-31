import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/numberService";

// ─── Create wallet for a number (called when number becomes ACTIVE) ──────────
export async function createWalletForNumber(params: {
  numberId: string;
  customerId: string;
  adminId?: string;
}): Promise<{ success: boolean; walletId?: string; error?: string }> {
  const { numberId, customerId, adminId } = params;
  const p = prisma as any;

  // Idempotent — return existing wallet if already created
  const existing = await p.numberWallet.findUnique({ where: { numberId } });
  if (existing) return { success: true, walletId: existing.id };

  const wallet = await p.numberWallet.create({
    data: {
      numberId,
      customerId,
      balance: 0,
      currency: "BDT",
      status: "ACTIVE",
    },
  });

  if (adminId) {
    await writeAuditLog({
      actorType: "admin",
      actorId: adminId,
      action: "CREATE_WALLET",
      resource: "wallet",
      resourceId: wallet.id,
      newValue: { numberId, customerId, balance: 0 },
    });
  }

  return { success: true, walletId: wallet.id };
}

// ─── Credit wallet (always goes through this service) ────────────────────────
export async function creditWallet(params: {
  walletId: string;
  amount: number;
  transactionType?: string;
  reference?: string;
  paymentId?: string;
  notes?: string;
  actorId: string;
}): Promise<{ success: boolean; balanceAfter?: number; error?: string }> {
  const { walletId, amount, transactionType = "CREDIT", reference, paymentId, notes, actorId } = params;
  const p = prisma as any;

  if (amount <= 0) return { success: false, error: "Amount must be positive" };

  // Row-level lock + transaction
  const result = await p.$transaction(async (tx: any) => {
    const wallet = await tx.numberWallet.findUnique({
      where: { id: walletId },
      select: { id: true, balance: true, status: true, numberId: true, customerId: true },
    });

    if (!wallet) throw new Error("Wallet not found");
    if (wallet.status === "CLOSED") throw new Error("Wallet is closed");
    if (wallet.status === "LOCKED") throw new Error("Wallet is locked");

    const balanceBefore = Number(wallet.balance);
    const balanceAfter = balanceBefore + amount;

    await tx.numberWallet.update({
      where: { id: walletId },
      data: { balance: balanceAfter, updatedAt: new Date() },
    });

    await tx.numberWalletTransaction.create({
      data: {
        walletId,
        numberId: wallet.numberId,
        customerId: wallet.customerId,
        transactionType,
        amount,
        balanceBefore,
        balanceAfter,
        reference: reference ?? null,
        paymentId: paymentId ?? null,
        status: "COMPLETED",
        notes: notes ?? null,
      },
    });

    return balanceAfter;
  });

  return { success: true, balanceAfter: result };
}

// ─── Debit wallet ────────────────────────────────────────────────────────────
export async function debitWallet(params: {
  walletId: string;
  amount: number;
  reference?: string;
  notes?: string;
  actorId: string;
}): Promise<{ success: boolean; balanceAfter?: number; error?: string }> {
  const { walletId, amount, reference, notes, actorId } = params;
  const p = prisma as any;

  if (amount <= 0) return { success: false, error: "Amount must be positive" };

  const result = await p.$transaction(async (tx: any) => {
    const wallet = await tx.numberWallet.findUnique({
      where: { id: walletId },
      select: { id: true, balance: true, status: true, numberId: true, customerId: true },
    });

    if (!wallet) throw new Error("Wallet not found");
    if (wallet.status === "CLOSED") throw new Error("Wallet is closed");
    if (Number(wallet.balance) < amount) throw new Error("Insufficient balance");

    const balanceBefore = Number(wallet.balance);
    const balanceAfter = balanceBefore - amount;

    await tx.numberWallet.update({
      where: { id: walletId },
      data: { balance: balanceAfter, updatedAt: new Date() },
    });

    await tx.numberWalletTransaction.create({
      data: {
        walletId,
        numberId: wallet.numberId,
        customerId: wallet.customerId,
        transactionType: "DEBIT",
        amount,
        balanceBefore,
        balanceAfter,
        reference: reference ?? null,
        status: "COMPLETED",
        notes: notes ?? null,
      },
    });

    return balanceAfter;
  });

  return { success: true, balanceAfter: result };
}

// ─── Get wallet with transactions ────────────────────────────────────────────
export async function getWallet(walletId: string) {
  const p = prisma as any;
  return p.numberWallet.findUnique({
    where: { id: walletId },
    include: {
      number: { select: { id: true, number: true, status: true } },
      customer: { select: { id: true, fullName: true, email: true } },
      transactions: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
}

// ─── List wallets ────────────────────────────────────────────────────────────
export async function listWallets(filter?: {
  customerId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const p = prisma as any;
  const where: any = {};
  if (filter?.customerId) where.customerId = filter.customerId;
  if (filter?.status && filter.status !== "ALL") where.status = filter.status;

  const page = filter?.page ?? 1;
  const pageSize = filter?.pageSize ?? 50;

  const [total, rows] = await Promise.all([
    p.numberWallet.count({ where }),
    p.numberWallet.findMany({
      where,
      include: {
        number: { select: { id: true, number: true, status: true, displayCompany: { select: { code: true } } } },
        customer: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { total, rows, page, pageSize, pages: Math.ceil(total / pageSize) };
}
