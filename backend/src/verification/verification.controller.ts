import { Controller, Get, Post, Param, Query, Body, Req } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { Request } from 'express';

@Controller()
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('verify')
  async createSearch(@Body() body: any, @Req() req: Request) {
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.verificationService.createSearch(body.nid, body.dob, ip);
  }

  @Get('verify/:id')
  async getSearchById(@Param('id') id: string) {
    return await this.verificationService.getSearchById(id);
  }

  @Get('searches')
  async getSearches(@Query() query: any) {
    return await this.verificationService.getSearches(query);
  }

  @Post('submit')
  async submitIcc(@Body() body: any) {
    return await this.verificationService.submitIcc(body);
  }

  @Get('submissions')
  async getSubmissions(@Query() query: any) {
    return await this.verificationService.getSubmissions(query);
  }
}
