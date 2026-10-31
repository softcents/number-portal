import { Controller, Get, Post, Patch, Delete, Param, Query, Body, Req } from '@nestjs/common';
import { NumbersService } from './numbers.service';
import { Request } from 'express';

@Controller('numbers')
export class NumbersController {
  constructor(private readonly numbersService: NumbersService) {}

  @Get()
  async getNumbers(@Query() query: any) {
    return await this.numbersService.getNumbers({
      status: query.status,
      numberType: query.numberType,
      providerId: query.providerId,
      displayCompanyId: query.displayCompanyId,
      search: query.search,
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : (query.pageSize ? parseInt(query.pageSize) : 50),
    });
  }

  @Get(':id')
  async getNumberById(@Param('id') id: string) {
    return await this.numbersService.getNumberById(id);
  }

  @Get(':id/history')
  async getNumberHistory(@Param('id') id: string) {
    return await this.numbersService.getNumberHistory(id);
  }

  @Post()
  async createNumber(@Body() body: any, @Req() req: Request) {
    const adminToken = req.cookies?.admin_token || 'admin_manual';
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.numbersService.createNumber(body, adminToken, ip);
  }

  @Patch(':id')
  async updateNumber(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const adminToken = req.cookies?.admin_token || 'admin_manual';
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.numbersService.updateNumber(id, body, adminToken, ip);
  }

  @Delete(':id')
  async deleteNumber(@Param('id') id: string, @Req() req: Request) {
    const adminToken = req.cookies?.admin_token || 'admin_manual';
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.numbersService.deleteNumber(id, adminToken, ip);
  }

  @Patch(':id/status')
  async changeStatus(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const adminToken = req.cookies?.admin_token || 'admin_manual';
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.numbersService.changeStatus({
      numberId: id,
      toStatus: body.status,
      changedBy: adminToken,
      reason: body.reason,
      source: 'admin_manual',
      ipAddress: ip,
    });
  }

  @Post('import/preview')
  async previewImport(@Body() body: { csvContent: string; filename?: string }, @Req() req: Request) {
    const adminToken = req.cookies?.admin_token || 'admin_manual';
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.numbersService.previewImportCsv({
      csvContent: body.csvContent,
      filename: body.filename,
      adminId: adminToken,
      ipAddress: ip,
    });
  }

  @Post('import/confirm')
  async confirmImport(
    @Body() body: { importId: string; defaultProviderId?: string; defaultDisplayCompanyId?: string },
    @Req() req: Request,
  ) {
    const adminToken = req.cookies?.admin_token || 'admin_manual';
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.numbersService.confirmImportCsv({
      importId: body.importId,
      adminId: adminToken,
      defaultProviderId: body.defaultProviderId,
      defaultDisplayCompanyId: body.defaultDisplayCompanyId,
      ipAddress: ip,
    });
  }
}
