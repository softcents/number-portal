import { Controller, Get, Post, Delete, Param, Query, Body, Req } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Request } from 'express';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async getOrders(@Query() query: any) {
    return await this.ordersService.getOrders({
      status: query.status,
      customerId: query.customerId,
      search: query.search,
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
    });
  }

  @Post()
  async createOrder(@Body() body: any, @Req() req: Request) {
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.ordersService.createOrder({
      customerId: body.customerId,
      numberIds: body.numberIds,
      notes: body.notes,
      reservationMinutes: body.reservationMinutes ? parseInt(body.reservationMinutes) : 15,
      actorId: body.customerId,
      ipAddress: ip,
    });
  }

  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    const order = await this.ordersService.getOrderById(id);
    return { success: true, order };
  }

  @Post(':id/cancel')
  async cancelOrder(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.ordersService.cancelOrder({
      orderId: id,
      actorId: body.actorId || 'customer',
      reason: body.reason || 'User cancelled order',
      ipAddress: ip,
    });
  }

  @Post(':id/complete-free')
  async completeFree(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.ordersService.completeFreeOrder(id, body.actorId || 'customer', ip);
  }

  @Post(':id/mark-paid')
  async markPaid(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.ordersService.markPaid(id, body.notes, body.transactionReference, 'admin', ip);
  }

  @Delete(':id')
  async deleteOrCancelOrder(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.ordersService.cancelOrder({
      orderId: id,
      actorId: 'admin',
      reason: body.reason || 'Admin cancelled order',
      ipAddress: ip,
    });
  }

  @Post('items/:id/retry-activation')
  async retryItemActivation(@Param('id') id: string, @Req() req: Request) {
    const adminToken = req.cookies?.admin_token || 'admin_manual';
    return await this.ordersService.retryItemActivation(id, adminToken);
  }
}
