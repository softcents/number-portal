import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  providers: [TasksService],
})
export class TasksModule {}
