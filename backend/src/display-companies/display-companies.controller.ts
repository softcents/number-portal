import { Controller, Get, Patch, Delete, Param, Body } from '@nestjs/common';
import { DisplayCompaniesService } from './display-companies.service';

@Controller('display-companies')
export class DisplayCompaniesController {
  constructor(private readonly displayCompaniesService: DisplayCompaniesService) {}

  @Get()
  async getDisplayCompanies() {
    return await this.displayCompaniesService.getDisplayCompanies();
  }

  @Get(':id')
  async getDisplayCompanyById(@Param('id') id: string) {
    return await this.displayCompaniesService.getDisplayCompanyById(id);
  }

  @Patch(':id')
  async updateDisplayCompany(@Param('id') id: string, @Body() body: any) {
    return await this.displayCompaniesService.updateDisplayCompany(id, body);
  }

  @Delete(':id')
  async deleteDisplayCompany(@Param('id') id: string) {
    return await this.displayCompaniesService.deleteDisplayCompany(id);
  }
}
