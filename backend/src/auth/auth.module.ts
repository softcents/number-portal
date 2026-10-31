import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AdminAuthController } from './admin-auth.controller';

@Module({
  controllers: [AuthController, AdminAuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
