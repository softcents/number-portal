import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { ActivationService } from './activation.service';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [WalletsModule],
  controllers: [OrdersController],
  providers: [OrdersService, ActivationService],
  exports: [OrdersService, ActivationService],
})
export class OrdersModule {}
