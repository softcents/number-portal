import { Module } from '@nestjs/common';
import { DisplayCompaniesService } from './display-companies.service';
import { DisplayCompaniesController } from './display-companies.controller';

@Module({
  controllers: [DisplayCompaniesController],
  providers: [DisplayCompaniesService],
  exports: [DisplayCompaniesService],
})
export class DisplayCompaniesModule {}
