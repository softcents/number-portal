import { Controller, Get, Patch, Delete, Param, Body } from '@nestjs/common';
import { ProvidersService } from './providers.service';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  async getProviders() {
    return await this.providersService.getProviders();
  }

  @Get(':id')
  async getProviderById(@Param('id') id: string) {
    return await this.providersService.getProviderById(id);
  }

  @Patch(':id')
  async updateProvider(@Param('id') id: string, @Body() body: any) {
    return await this.providersService.updateProvider(id, body);
  }

  @Delete(':id')
  async deleteProvider(@Param('id') id: string) {
    return await this.providersService.deleteProvider(id);
  }
}
