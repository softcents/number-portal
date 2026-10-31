import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { NumbersModule } from './numbers/numbers.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { WalletsModule } from './wallets/wallets.module';
import { ProvidersModule } from './providers/providers.module';
import { DisplayCompaniesModule } from './display-companies/display-companies.module';
import { CustomersModule } from './customers/customers.module';
import { VerificationModule } from './verification/verification.module';
import { StatsModule } from './stats/stats.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    NumbersModule,
    OrdersModule,
    PaymentsModule,
    WalletsModule,
    ProvidersModule,
    DisplayCompaniesModule,
    CustomersModule,
    VerificationModule,
    StatsModule,
    TasksModule,
  ],
})
export class AppModule {}
