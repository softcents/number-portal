import { Controller, Post, Get, Body, Req, Res, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/login')
  async adminLogin(@Body() body: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    const result = await this.authService.adminLogin(body.username, body.password, ip);

    res.cookie('admin_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400 * 1000,
    });

    return result;
  }

  @Get('admin/me')
  async adminMe(@Req() req: Request) {
    const token = req.cookies?.admin_token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Not authenticated');

    const payload = this.authService.verifyToken(token);
    if (!payload || payload.role !== 'ADMIN') throw new UnauthorizedException('Invalid or expired admin session');

    return { authenticated: true, admin: payload };
  }

  @Post('login')
  async centralLogin(@Body() body: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    const result = await this.authService.centralLogin(body.email, body.password, ip);

    res.cookie('customer_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400 * 7 * 1000,
    });

    return result;
  }

  @Get('me')
  async me(@Req() req: Request) {
    const token = req.cookies?.customer_token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return { authenticated: false };

    const payload = this.authService.verifyToken(token);
    if (!payload || !payload.customerId) return { authenticated: false };

    const customer = await this.authService.getCustomerSession(payload.customerId);
    return {
      authenticated: true,
      user: payload,
      customer,
    };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('customer_token', { path: '/' });
    res.clearCookie('admin_token', { path: '/' });
    return { success: true, message: 'Logged out successfully' };
  }
}
