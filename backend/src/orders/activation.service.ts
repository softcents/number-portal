import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { WalletsService } from '../wallets/wallets.service';

@Injectable()
export class ActivationService {
  private readonly logger = new Logger(ActivationService.name);
  private readonly workerUrl: string;
  private readonly workerSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallets: WalletsService,
  ) {
    this.workerUrl = process.env.WORKER_URL || 'http://127.0.0.1:8001';
    this.workerSecret = process.env.WORKER_SECRET || '5bc7bfd6c62bf0786f86e8c9a1e0d67e696fac161ef7c902656010ff1d069c2a';
  }

  /**
   * Executes number activation against external provider (ICC or ICON)
   * Separated strictly from Order & Payment boundaries.
   */
  async activateOrderItem(orderItemId: string, actorId: string = 'system') {
    const p = this.prisma as any;

    const item = await p.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        order: { include: { customer: true } },
        number: { include: { provider: true } },
      },
    });

    if (!item) {
      this.logger.error(`OrderItem ${orderItemId} not found for activation`);
      throw new NotFoundException('OrderItem not found');
    }

    const { number, order } = item;
    const customer = order.customer;
    const providerCode = number.provider?.code || 'ICC';

    this.logger.log(`[Activation] Starting activation for number ${number.number} via provider ${providerCode}`);

    // Set status to PROCESSING
    await p.$transaction(async (tx: any) => {
      await tx.number.update({
        where: { id: number.id },
        data: {
          status: 'PROCESSING',
          activationStatus: 'PROCESSING',
          updatedAt: new Date(),
        },
      });

      await tx.orderItem.update({
        where: { id: orderItemId },
        data: { status: 'PROCESSING', updatedAt: new Date() },
      });

      await tx.numberStatusHistory.create({
        data: {
          numberId: number.id,
          fromStatus: number.status,
          toStatus: 'PROCESSING',
          changedBy: actorId,
          reason: `Starting ${providerCode} provider automation`,
          source: 'system',
        },
      });
    });

    // Prepare payload for automation engine
    const payload = {
      number: number.number,
      provider: providerCode,
      subscriberName: customer.fullName || 'Valued Subscriber',
      nationalIdNumber: customer.nidHash || '',
      phoneNumber: customer.phoneNumber || number.number,
      birthDate: '1990-01-01',
      validEmail: customer.email,
      subscriberType: customer.customerType === 'COMPANY' ? 'Company' : 'Individual',
      gender: 'Male',
      fatherName: '',
      motherName: '',
      presentStreet: 'Dhaka',
      presentCity: 'Dhaka',
      presentPostalZip: '1212',
      presentCountry: 'Bangladesh',
    };

    let activationResult = { ok: false, stage: 'start', durationMs: 0, reason: 'unknown' };

    try {
      const response = await fetch(`${this.workerUrl}/activate-number`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-secret': this.workerSecret,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        activationResult = await response.json();
      } else {
        const errorText = await response.text();
        this.logger.error(`[Activation Error] Worker returned HTTP ${response.status}: ${errorText}`);
        activationResult = { ok: false, stage: 'http_error', durationMs: 0, reason: `HTTP_${response.status}` };
      }
    } catch (err: any) {
      this.logger.error(`[Activation Exception] Failed to reach worker: ${err?.message}`);
      activationResult = { ok: false, stage: 'network_error', durationMs: 0, reason: 'worker_unreachable' };
    }

    const now = new Date();

    if (activationResult.ok) {
      // SUCCESS: Mark Number ACTIVE, OrderItem COMPLETED, create wallet
      await p.$transaction(async (tx: any) => {
        await tx.number.update({
          where: { id: number.id },
          data: {
            status: 'ACTIVE',
            activationStatus: 'ACTIVATED',
            customerId: customer.id,
            updatedAt: now,
          },
        });

        await tx.orderItem.update({
          where: { id: orderItemId },
          data: {
            status: 'COMPLETED',
            activatedAt: now,
            failureReason: null,
            updatedAt: now,
          },
        });

        await tx.numberStatusHistory.create({
          data: {
            numberId: number.id,
            fromStatus: 'PROCESSING',
            toStatus: 'ACTIVE',
            changedBy: actorId,
            reason: `Provider ${providerCode} activation verified (${activationResult.durationMs}ms)`,
            source: 'provider_automation',
          },
        });

        // Ensure wallet exists for this active number
        const existingWallet = await tx.numberWallet.findUnique({
          where: { numberId: number.id },
        });

        if (!existingWallet) {
          await tx.numberWallet.create({
            data: {
              numberId: number.id,
              customerId: customer.id,
              balance: 0,
              currency: 'BDT',
              status: 'ACTIVE',
            },
          });
        }
      });

      await this.audit.writeAudit({
        actorType: 'system',
        actorId,
        action: 'ACTIVATE_NUMBER_SUCCESS',
        resource: 'number',
        resourceId: number.id,
        newValue: { orderItemId, provider: providerCode, durationMs: activationResult.durationMs },
      });

      this.logger.log(`[Activation Success] Number ${number.number} activated successfully`);
      return { success: true, status: 'ACTIVE', durationMs: activationResult.durationMs };

    } else {
      // Provider automation sync note (portal login failed, simulated sandbox, or provider offline)
      // The customer still owns the number they purchased! Keep status ACTIVE and ensure wallet exists.
      await p.$transaction(async (tx: any) => {
        await tx.number.update({
          where: { id: number.id },
          data: {
            status: 'ACTIVE',
            activationStatus: 'ACTIVATION_PENDING',
            customerId: customer.id,
            updatedAt: now,
          },
        });

        await tx.orderItem.update({
          where: { id: orderItemId },
          data: {
            status: 'COMPLETED',
            failureReason: activationResult.reason || 'Activation pending manual verification',
            updatedAt: now,
          },
        });

        await tx.numberStatusHistory.create({
          data: {
            numberId: number.id,
            fromStatus: 'PROCESSING',
            toStatus: 'ACTIVE',
            changedBy: actorId,
            reason: `Purchased by customer. Provider ${providerCode} sync note: ${activationResult.reason}`,
            source: 'provider_automation',
          },
        });

        // Ensure wallet exists for this active number
        const existingWallet = await tx.numberWallet.findUnique({
          where: { numberId: number.id },
        });

        if (!existingWallet) {
          await tx.numberWallet.create({
            data: {
              numberId: number.id,
              customerId: customer.id,
              balance: 0,
              currency: 'BDT',
              status: 'ACTIVE',
            },
          });
        }
      });

      await this.audit.writeAudit({
        actorType: 'system',
        actorId,
        action: 'ACTIVATE_NUMBER_PENDING',
        resource: 'number',
        resourceId: number.id,
        newValue: { orderItemId, provider: providerCode, reason: activationResult.reason },
      });

      this.logger.warn(`[Activation Failed] Number ${number.number} failed: ${activationResult.reason}`);
      return { success: false, status: 'FAILED', reason: activationResult.reason };
    }
  }

  /**
   * Admin retry for a failed activation
   */
  async retryActivation(orderItemId: string, adminId: string) {
    const p = this.prisma as any;
    const item = await p.orderItem.findUnique({ where: { id: orderItemId } });
    if (!item) throw new NotFoundException('OrderItem not found');
    if (item.status === 'COMPLETED') throw new BadRequestException('OrderItem is already completed and active');

    return await this.activateOrderItem(orderItemId, adminId);
  }
}
