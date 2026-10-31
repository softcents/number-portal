import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('admin')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('stats')
  async getStats() {
    return await this.statsService.getDashboardStats();
  }

  @Get('audit')
  async getAudit(@Query() query: any) {
    return await this.statsService.getAuditLogs(query);
  }
}
