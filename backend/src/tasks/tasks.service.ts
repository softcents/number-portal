import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly lowBalanceThreshold = 100; // BDT 100 threshold

  constructor(
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleStaleOrderCleanup() {
    try {
      const result = await this.ordersService.expireStaleOrders();
      if (result.expiredCount > 0) {
        this.logger.log(`[Cron Task] Expired ${result.expiredCount} stale reservation orders`);
      }
    } catch (err: any) {
      this.logger.error(`[Cron Task Error] Stale order cleanup failed: ${err?.message}`);
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleLowBalanceCheck() {
    try {
      const p = this.prisma as any;
      const lowWallets = await p.numberWallet.findMany({
        where: {
          status: 'ACTIVE',
          balance: { lt: this.lowBalanceThreshold },
        },
        include: {
          number: { select: { number: true } },
          customer: { select: { fullName: true, email: true } },
        },
        take: 50,
      });

      if (lowWallets.length > 0) {
        this.logger.warn(`[Low Balance Alert] Detected ${lowWallets.length} number wallets below ৳${this.lowBalanceThreshold}`);
        for (const w of lowWallets) {
          this.logger.warn(` -> Number ${w.number?.number} (Customer: ${w.customer?.fullName}): Balance ৳${w.balance}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`[Cron Task Error] Low balance check failed: ${err?.message}`);
    }
  }
}
