import { Controller, Get, Post, Param, Query, Body, Req } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { Request } from 'express';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  async getWallets(@Query() query: any) {
    return await this.walletsService.getWallets(query);
  }

  @Get(':id')
  async getWalletById(@Param('id') id: string) {
    return await this.walletsService.getWalletById(id);
  }

  @Post(':id/credit')
  async creditWallet(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const actorId = req.cookies?.admin_token || 'admin_manual';
    return await this.walletsService.creditWallet({
      walletId: id,
      amount: parseFloat(body.amount),
      transactionType: body.transactionType || 'CREDIT',
      reference: body.reference,
      notes: body.notes,
      actorId,
    });
  }

  @Post(':id/debit')
  async debitWallet(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const actorId = req.cookies?.admin_token || 'admin_manual';
    return await this.walletsService.debitWallet({
      walletId: id,
      amount: parseFloat(body.amount),
      transactionType: body.transactionType || 'DEBIT',
      reference: body.reference,
      notes: body.notes,
      actorId,
    });
  }
}
