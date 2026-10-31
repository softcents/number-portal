import { Controller, Get, Patch, Param, Query, Body } from '@nestjs/common';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async getCustomers(@Query() query: any) {
    return await this.customersService.getCustomers(query);
  }

  @Get(':id')
  async getCustomerById(@Param('id') id: string) {
    return await this.customersService.getCustomerById(id);
  }

  @Patch(':id')
  async updateCustomer(@Param('id') id: string, @Body() body: any) {
    return await this.customersService.updateCustomer(id, body);
  }
}
