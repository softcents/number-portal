import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/numberService";
import { createWalletForNumber } from "@/lib/walletService";

// Helper to generate unique order number: ORD-YYYYMMDD-XXXXX
export function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ORD-${dateStr}-${randomPart}`;
}

export interface CreateOrderParams {
  customerId: string;
  numberIds: string[];
  notes?: string;
  reservationMinutes?: number;
  actorId?: string;
  ipAddress?: string;
}

// ─── 1. Create Order & Atomically Reserve Numbers ────────────────────────────
export async function createOrder(params: CreateOrderParams) {
  const {
    customerId,
    numberIds,
    notes,
    reservationMinutes = 15,
    actorId = "system",
    ipAddress,
  } = params;

  if (!numberIds || numberIds.length === 0) {
    throw new Error("At least one number must be specified to create an order");
  }

  const p = prisma as any;

  // Run all checks & reservations in a single serializable/atomic transaction
  const result = await p.$transaction(async (tx: any) => {
    // 1. Verify customer exists and is active
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true, fullName: true, email: true, isActive: true },
    });

    if (!customer) throw new Error("Customer not found");
    if (!customer.isActive) throw new Error("Customer account is inactive");

    // 2. Fetch and check availability of all requested numbers
    const numbers = await tx.number.findMany({
      where: { id: { in: numberIds } },
      select: {
        id: true,
        number: true,
        status: true,
        salePrice: true,
        displayCompanyId: true,
      },
    });

    if (numbers.length !== numberIds.length) {
      throw new Error("One or more selected numbers could not be found");
    }

    const unavailable = numbers.filter((n: any) => n.status !== "AVAILABLE");
    if (unavailable.length > 0) {
      const numbersList = unavailable.map((n: any) => n.number).join(", ");
      throw new Error(
        `The following numbers are no longer available: ${numbersList}`
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + reservationMinutes * 60 * 1000);

    // Calculate total amount
    let totalAmount = 0;
    for (const num of numbers) {
      const price = num.salePrice ? Number(num.salePrice) : 0;
      totalAmount += price;
    }

    const orderNumber = generateOrderNumber();

    // 3. Create the Order
    const order = await tx.order.create({
      data: {
        orderNumber,
        customerId,
        status: "PENDING",
        totalAmount,
        currency: "BDT",
        notes: notes ?? null,
        expiresAt,
      },
    });

    // 4. Create OrderItems & Reserve Numbers atomically
    for (const num of numbers) {
      const price = num.salePrice ? Number(num.salePrice) : 0;

      await tx.orderItem.create({
        data: {
          orderId: order.id,
          numberId: num.id,
          salePrice: price,
          status: "RESERVED",
        },
      });

      // Update number to RESERVED
      await tx.number.update({
        where: { id: num.id },
        data: {
          status: "RESERVED",
          reservedAt: now,
          reservationExpiresAt: expiresAt,
          reservedBy: customerId,
          updatedAt: now,
        },
      });

      // Record status change in NumberStatusHistory
      await tx.numberStatusHistory.create({
        data: {
          numberId: num.id,
          fromStatus: "AVAILABLE",
          toStatus: "RESERVED",
          changedBy: actorId,
          reason: `Reserved by Order ${orderNumber}`,
          source: "system",
          ipAddress: ipAddress ?? null,
        },
      });
    }

    // 5. Create OrderStatusHistory record
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: null,
        toStatus: "PENDING",
        changedBy: actorId,
        reason: "Order created, numbers reserved",
      },
    });

    return { order, numbersCount: numbers.length, expiresAt };
  });

  // Log system audit non-blockingly
  await writeAuditLog({
    actorType: actorId === "system" ? "system" : "customer",
    actorId: customerId,
    action: "CREATE_ORDER",
    resource: "order",
    resourceId: result.order.id,
    newValue: {
      orderNumber: result.order.orderNumber,
      totalAmount: result.order.totalAmount,
      numberIds,
      expiresAt: result.expiresAt,
    },
    ipAddress,
  });

  return result;
}

// ─── 2. Cancel Order & Release Reserved Numbers ──────────────────────────────
export async function cancelOrder(params: {
  orderId: string;
  actorId: string;
  reason?: string;
  ipAddress?: string;
}) {
  const { orderId, actorId, reason = "Order cancelled", ipAddress } = params;
  const p = prisma as any;

  const result = await p.$transaction(async (tx: any) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { number: true } } },
    });

    if (!order) throw new Error("Order not found");
    if (order.status === "PAID") {
      throw new Error("Cannot cancel an already completed and paid order");
    }
    if (order.status === "CANCELLED" || order.status === "EXPIRED") {
      return { order, alreadyCancelled: true };
    }

    const now = new Date();

    // Release all reserved numbers back to AVAILABLE
    for (const item of order.items) {
      if (item.number && item.number.status === "RESERVED") {
        await tx.number.update({
          where: { id: item.number.id },
          data: {
            status: "AVAILABLE",
            reservedAt: null,
            reservationExpiresAt: null,
            reservedBy: null,
            updatedAt: now,
          },
        });

        await tx.numberStatusHistory.create({
          data: {
            numberId: item.number.id,
            fromStatus: "RESERVED",
            toStatus: "AVAILABLE",
            changedBy: actorId,
            reason: `Order ${order.orderNumber} cancelled: ${reason}`,
            source: "system",
            ipAddress: ipAddress ?? null,
          },
        });
      }

      await tx.orderItem.update({
        where: { id: item.id },
        data: { status: "CANCELLED" },
      });
    }

    // Update order status
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        updatedAt: now,
      },
    });

    // Record order status history
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: "CANCELLED",
        changedBy: actorId,
        reason,
      },
    });

    return { order: updatedOrder, releasedCount: order.items.length };
  });

  await writeAuditLog({
    actorType: "user",
    actorId,
    action: "CANCEL_ORDER",
    resource: "order",
    resourceId: orderId,
    reason,
    ipAddress,
  });

  return result;
}

// ─── 3. Complete Order Upon Verified Payment ─────────────────────────────────
export async function completeOrder(params: {
  orderId: string;
  paymentId: string;
  actorId?: string;
  ipAddress?: string;
}) {
  const { orderId, paymentId, actorId = "system", ipAddress } = params;
  const p = prisma as any;

  const result = await p.$transaction(async (tx: any) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        items: { include: { number: true } },
      },
    });

    if (!order) throw new Error("Order not found");
    if (order.status === "PAID") {
      return { order, alreadyPaid: true };
    }

    const now = new Date();

    // Set numbers to PROCESSING and queue for provider automation
    for (const item of order.items) {
      if (item.number) {
        await tx.number.update({
          where: { id: item.number.id },
          data: {
            status: "PROCESSING",
            customerId: order.customerId,
            reservedAt: null,
            reservationExpiresAt: null,
            reservedBy: null,
            activationStatus: "PROCESSING",
            updatedAt: now,
          },
        });

        // Record number status history
        await tx.numberStatusHistory.create({
          data: {
            numberId: item.number.id,
            fromStatus: item.number.status,
            toStatus: "PROCESSING",
            changedBy: actorId,
            reason: `Order ${order.orderNumber} paid via payment ${paymentId}; queuing provider activation`,
            source: "system",
            ipAddress: ipAddress ?? null,
          },
        });
      }

      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          status: "PROCESSING",
          updatedAt: now,
        },
      });
    }

    // Update order status to PAID
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        status: "PAID",
        updatedAt: now,
      },
    });

    // Record order status history
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: "PAID",
        changedBy: actorId,
        reason: `Payment verified (${paymentId}); queued for activation`,
      },
    });

    return { order: updatedOrder, items: order.items, customer: order.customer, itemsCount: order.items.length };
  });

  await writeAuditLog({
    actorType: "system",
    actorId,
    action: "COMPLETE_ORDER_PAYMENT",
    resource: "order",
    resourceId: orderId,
    newValue: { paymentId, status: "PAID" },
    ipAddress,
  });

  if (result.items && result.items.length > 0) {
    for (const item of result.items) {
      triggerOrderItemActivation(item.id, actorId).catch(() => {});
    }
  }

  return result;
}

export async function triggerOrderItemActivation(orderItemId: string, actorId: string = "system") {
  const p = prisma as any;
  const item = await p.orderItem.findUnique({
    where: { id: orderItemId },
    include: {
      order: { include: { customer: true } },
      number: { include: { provider: { include: { credential: true } } } },
    },
  });
  if (!item) return;

  const { number, order } = item;
  const customer = order.customer;
  const providerCode = number.provider?.code || "ICC";
  const providerLoginUrl = number.provider?.loginUrl;
  const providerUsername = number.provider?.credential?.username;
  const providerPassword = number.provider?.credential?.encryptedPassword
    ? Buffer.from(number.provider.credential.encryptedPassword, "base64").toString("utf-8")
    : undefined;

  const workerUrl = process.env.WORKER_URL || "http://127.0.0.1:8001";
  const workerSecret = process.env.WORKER_SECRET || "5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a";

  const payload = {
    number: number.number,
    provider: providerCode,
    providerLoginUrl,
    providerUsername,
    providerPassword,
    subscriberName: customer?.fullName || "Valued Subscriber",
    nationalIdNumber: customer?.nidHash || "",
    phoneNumber: customer?.phoneNumber || number.number,
    birthDate: "1990-01-01",
    validEmail: customer?.email || "customer@softcents.com",
    subscriberType: customer?.customerType === "COMPANY" ? "Company" : "Individual",
    gender: "Male",
    fatherName: "",
    motherName: "",
    presentStreet: "Dhaka",
    presentCity: "Dhaka",
    presentPostalZip: "1212",
    presentCountry: "Bangladesh",
  };

  try {
    const res = await fetch(`${workerUrl}/activate-number`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": workerSecret,
      },
      body: JSON.stringify(payload),
    });

    const data = res.ok ? await res.json() : { ok: false, reason: `HTTP_${res.status}` };
    const now = new Date();

    if (data.ok) {
      await p.$transaction(async (tx: any) => {
        await tx.number.update({
          where: { id: number.id },
          data: {
            status: "ACTIVE",
            activationStatus: "ACTIVATED",
            customerId: customer?.id,
            updatedAt: now,
          },
        });

        await tx.orderItem.update({
          where: { id: orderItemId },
          data: { status: "COMPLETED", activatedAt: now, failureReason: null, updatedAt: now },
        });

        await tx.numberStatusHistory.create({
          data: {
            numberId: number.id,
            fromStatus: "PROCESSING",
            toStatus: "ACTIVE",
            changedBy: actorId,
            reason: `Provider ${providerCode} activation verified`,
            source: "provider_automation",
          },
        });

        const existingWallet = await tx.numberWallet.findUnique({
          where: { numberId: number.id },
        });
        if (!existingWallet && customer?.id) {
          await tx.numberWallet.create({
            data: {
              numberId: number.id,
              customerId: customer.id,
              balance: 0,
              currency: "BDT",
              status: "ACTIVE",
            },
          });
        }
      });
    } else {
      // Upstream provider automated registration had an issue (e.g. portal login failed, simulated sandbox, or provider offline)
      // The customer still owns the number they purchased! Keep status ACTIVE and ensure wallet exists.
      await p.$transaction(async (tx: any) => {
        await tx.number.update({
          where: { id: number.id },
          data: {
            status: "ACTIVE",
            activationStatus: "ACTIVATION_PENDING",
            customerId: customer?.id,
            updatedAt: now,
          },
        });

        await tx.orderItem.update({
          where: { id: orderItemId },
          data: {
            status: "COMPLETED",
            failureReason: data.reason || "Provider activation pending manual verification",
            updatedAt: now,
          },
        });

        await tx.numberStatusHistory.create({
          data: {
            numberId: number.id,
            fromStatus: "PROCESSING",
            toStatus: "ACTIVE",
            changedBy: actorId,
            reason: `Purchased by customer. Provider ${providerCode} sync note: ${data.reason}`,
            source: "provider_automation",
          },
        });

        const existingWallet = await tx.numberWallet.findUnique({
          where: { numberId: number.id },
        });
        if (!existingWallet && customer?.id) {
          await tx.numberWallet.create({
            data: {
              numberId: number.id,
              customerId: customer.id,
              balance: 0,
              currency: "BDT",
              status: "ACTIVE",
            },
          });
        }
      });
    }
  } catch (err: any) {
    console.error(`Activation worker call error for item ${orderItemId}:`, err);
    // Even if worker was unreachable, ensure the purchased number is ACTIVE and has a wallet
    try {
      const now = new Date();
      await p.$transaction(async (tx: any) => {
        await tx.number.update({
          where: { id: number.id },
          data: {
            status: "ACTIVE",
            activationStatus: "ACTIVATION_PENDING",
            customerId: customer?.id,
            updatedAt: now,
          },
        });

        await tx.orderItem.update({
          where: { id: orderItemId },
          data: {
            status: "COMPLETED",
            failureReason: err?.message || "Activation worker unreachable",
            updatedAt: now,
          },
        });

        const existingWallet = await tx.numberWallet.findUnique({
          where: { numberId: number.id },
        });
        if (!existingWallet && customer?.id) {
          await tx.numberWallet.create({
            data: {
              numberId: number.id,
              customerId: customer.id,
              balance: 0,
              currency: "BDT",
              status: "ACTIVE",
            },
          });
        }
      });
    } catch (fallbackErr) {
      console.error("Fallback activation update error:", fallbackErr);
    }
  }
}

// ─── 4. Expire Stale Pending Orders ──────────────────────────────────────────
export async function expireStaleOrders() {
  const p = prisma as any;
  const now = new Date();

  const staleOrders = await p.order.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
    select: { id: true, orderNumber: true },
  });

  const expiredIds: string[] = [];
  for (const ord of staleOrders) {
    try {
      await cancelOrder({
        orderId: ord.id,
        actorId: "system_cron",
        reason: "Reservation TTL expired",
      });
      expiredIds.push(ord.id);
    } catch (e: any) {
      console.error(`Failed to expire order ${ord.orderNumber}:`, e?.message);
    }
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ─── 5. Fetch Orders with Filtering & Pagination ─────────────────────────────
export async function getOrders(params: {
  status?: string;
  customerId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { status, customerId, search, page = 1, limit = 20 } = params;
  const p = prisma as any;

  const where: any = {};
  if (status && status !== "ALL") where.status = status;
  if (customerId) where.customerId = customerId;
  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: "insensitive" } },
      { customer: { fullName: { contains: search, mode: "insensitive" } } },
      { customer: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const skip = (page - 1) * limit;

  const [total, orders] = await Promise.all([
    p.order.count({ where }),
    p.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        customer: {
          select: { id: true, fullName: true, email: true, phoneNumber: true },
        },
        items: {
          include: {
            number: {
              select: {
                id: true,
                number: true,
                normalizedNumber: true,
                displayCompany: { select: { code: true, name: true } },
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            gateway: true,
            amount: true,
            status: true,
            paidAt: true,
            gatewayTransactionId: true,
          },
        },
      },
    }),
  ]);

  return {
    orders,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── 6. Get Order Detail By ID ───────────────────────────────────────────────
export async function getOrderById(orderId: string) {
  const p = prisma as any;
  return await p.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: {
        include: {
          number: {
            include: {
              provider: { select: { id: true, code: true, name: true } },
              displayCompany: { select: { id: true, code: true, name: true } },
              wallet: true,
            },
          },
        },
      },
      payments: {
        include: {
          auditLogs: { orderBy: { createdAt: "desc" } },
        },
      },
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });
}
