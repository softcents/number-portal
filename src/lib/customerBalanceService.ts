import { prisma } from "@/lib/prisma";

export interface CreditBalanceParams {
  customerId: string;
  resellerId?: string | null;
  amount: number;
  paymentId?: string | null;
  referenceId?: string | null;
  description?: string | null;
}

export interface DebitBalanceParams {
  customerId: string;
  amount: number;
  referenceId?: string | null;
  description?: string | null;
}

/**
 * Automatically credits customer's wallet/account balance.
 * Runs atomically in a Prisma interactive transaction.
 */
export async function creditCustomerBalance(params: CreditBalanceParams) {
  const { customerId, resellerId, amount, paymentId, referenceId, description } = params;

  if (amount <= 0) {
    throw new Error("Credit amount must be greater than zero");
  }

  const p = prisma as any;

  return await p.$transaction(async (tx: any) => {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    const effectiveResellerId = resellerId || customer.resellerId || null;
    const balanceBefore = Number(customer.balance || 0);
    const balanceAfter = Number((balanceBefore + amount).toFixed(2));

    // Update customer's balance
    const updatedCustomer = await tx.customer.update({
      where: { id: customerId },
      data: { balance: balanceAfter },
    });

    // Record transaction
    const balanceTx = await tx.customerBalanceTransaction.create({
      data: {
        customerId,
        resellerId: effectiveResellerId,
        type: "DEPOSIT",
        amount,
        balanceBefore,
        balanceAfter,
        referenceId: referenceId || paymentId || null,
        description: description || "Auto balance deposit via payment gateway",
      },
    });

    return {
      success: true,
      customerId,
      balanceBefore,
      balanceAfter,
      transactionId: balanceTx.id,
      customer: updatedCustomer,
    };
  });
}

/**
 * Debits customer's account balance (for number purchases, recharges, etc.)
 * Runs atomically in a Prisma interactive transaction.
 */
export async function debitCustomerBalance(params: DebitBalanceParams) {
  const { customerId, amount, referenceId, description } = params;

  if (amount <= 0) {
    throw new Error("Debit amount must be greater than zero");
  }

  const p = prisma as any;

  return await p.$transaction(async (tx: any) => {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    const currentBalance = Number(customer.balance || 0);
    if (currentBalance < amount) {
      throw new Error(
        `Insufficient balance. Current balance is ৳${currentBalance.toFixed(2)}, required ৳${amount.toFixed(2)}`
      );
    }

    const balanceBefore = currentBalance;
    const balanceAfter = Number((balanceBefore - amount).toFixed(2));

    const updatedCustomer = await tx.customer.update({
      where: { id: customerId },
      data: { balance: balanceAfter },
    });

    const balanceTx = await tx.customerBalanceTransaction.create({
      data: {
        customerId,
        resellerId: customer.resellerId || null,
        type: "DEBIT",
        amount,
        balanceBefore,
        balanceAfter,
        referenceId: referenceId || null,
        description: description || "Balance deduction",
      },
    });

    return {
      success: true,
      customerId,
      balanceBefore,
      balanceAfter,
      transactionId: balanceTx.id,
      customer: updatedCustomer,
    };
  });
}

/**
 * Fetches customer balance, transaction history, and reseller gateway information.
 */
export async function getCustomerBalanceInfo(customerId: string) {
  const p = prisma as any;

  const customer = await p.customer.findUnique({
    where: { id: customerId },
    include: {
      reseller: {
        select: {
          id: true,
          brandName: true,
          companyName: true,
          pgType: true,
          pgIsActive: true,
          manualBkashNumber: true,
          manualNagadNumber: true,
          manualRocketNumber: true,
          manualPaymentInstructions: true,
          supportEmail: true,
          supportPhone: true,
        },
      },
      balanceTransactions: {
        take: 30,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  return {
    balance: Number(customer.balance || 0),
    currency: "BDT",
    reseller: customer.reseller
      ? {
          id: customer.reseller.id,
          name: customer.reseller.brandName || customer.reseller.companyName,
          hasPersonalGateway: Boolean(customer.reseller.pgIsActive),
          manualPayment: {
            bkash: customer.reseller.manualBkashNumber,
            nagad: customer.reseller.manualNagadNumber,
            rocket: customer.reseller.manualRocketNumber,
            instructions: customer.reseller.manualPaymentInstructions,
          },
          support: {
            email: customer.reseller.supportEmail,
            phone: customer.reseller.supportPhone,
          },
        }
      : null,
    transactions: customer.balanceTransactions.map((tx: any) => ({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount),
      balanceBefore: Number(tx.balanceBefore),
      balanceAfter: Number(tx.balanceAfter),
      referenceId: tx.referenceId,
      description: tx.description,
      createdAt: tx.createdAt,
    })),
  };
}
