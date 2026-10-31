import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

export interface CentralUserSession {
  customerId: string;
  centralIdentityUserId: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  customerType: string;
  authorizedApps: string[];
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.jwtSecret = process.env.JWT_SECRET || 'softcents-super-secret-jwt-key-2026';
  }

  // ─── Sign & Verify Token ─────────────────────────────────────────────────────
  signToken(payload: any, expiresInSeconds = 86400 * 7): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  verifyToken(token: string): any | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, body, signature] = parts;
      const expectedSig = crypto
        .createHmac('sha256', this.jwtSecret)
        .update(`${header}.${body}`)
        .digest('base64url');
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        return null;
      }
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  // ─── Admin Authentication ───────────────────────────────────────────────────
  async adminLogin(username: string, pass: string, ipAddress?: string) {
    if (!username || !pass) {
      throw new BadRequestException('Username and password are required');
    }

    const admin = await this.prisma.admin.findUnique({
      where: { username: username.trim() },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const isMatch = await bcrypt.compare(pass, admin.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const token = this.signToken({
      sub: admin.id,
      role: 'ADMIN',
      username: admin.username,
    });

    await this.audit.writeAudit({
      actorType: 'admin',
      actorId: admin.id,
      action: 'ADMIN_LOGIN',
      resource: 'auth',
      ipAddress,
    });

    return {
      success: true,
      token,
      admin: { id: admin.id, username: admin.username },
    };
  }

  // ─── Central Identity SSO Authentication ────────────────────────────────────
  async centralLogin(email: string, pass: string, ipAddress?: string) {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !pass) {
      throw new BadRequestException('Email and password are required');
    }

    const p = this.prisma as any;
    let customer = await p.customer.findFirst({
      where: { email: trimmedEmail },
    });

    let centralVerified = false;
    let centralUserId = customer?.centralIdentityUserId || `usr_${crypto.randomBytes(8).toString('hex')}`;
    let customerFullName = customer?.fullName || trimmedEmail.split('@')[0].replace(/[._-]/g, ' ');
    let customerPhone = customer?.phoneNumber || '01700000000';
    let customerType = customer?.customerType || 'INDIVIDUAL';
    let isKycVerified = !!customer?.kycVerifiedAt;

    // Probe Central Identity API if available
    try {
      const centralApiUrl = process.env.CENTRAL_IDENTITY_API_URL || 'http://localhost:4000/api/auth/login';
      const res = await fetch(centralApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password: pass }),
        signal: AbortSignal.timeout(1200),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          centralVerified = true;
          centralUserId = data.user.id || centralUserId;
          customerFullName = data.user.name || `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || customerFullName;
          customerPhone = data.user.phone || customerPhone;
          isKycVerified = data.user.status === 'ACTIVE' || data.user.is_verified;
        }
      }
    } catch {
      // Central API offline, continue with auto-provisioning
    }

    if (!customer) {
      const defaultName = trimmedEmail.split('@')[0];
      const capitalized = defaultName.charAt(0).toUpperCase() + defaultName.slice(1);

      customer = await p.customer.create({
        data: {
          centralIdentityUserId: centralUserId,
          fullName: capitalized,
          email: trimmedEmail,
          phoneNumber: customerPhone,
          customerType,
          isActive: true,
          notes: 'Auto-provisioned via Central Identity login in NestJS',
        },
      });
    }

    const session: CentralUserSession = {
      customerId: customer.id,
      centralIdentityUserId: customer.centralIdentityUserId,
      email: customer.email,
      fullName: customer.fullName,
      phoneNumber: customer.phoneNumber,
      customerType: customer.customerType,
      authorizedApps: [
        'number-sale',
        'sms-mgmt',
        'pbx-mgmt',
        'edumax',
        'crm',
        'billing',
        'reports',
        'central-identity',
      ],
    };

    const token = this.signToken(session);

    await this.audit.writeAudit({
      actorType: 'customer',
      actorId: customer.id,
      action: 'CENTRAL_SSO_LOGIN',
      resource: 'auth',
      ipAddress,
    });

    return {
      success: true,
      token,
      user: session,
    };
  }

  async getCustomerSession(customerId: string) {
    const p = this.prisma as any;
    return await p.customer.findUnique({
      where: { id: customerId },
      include: {
        numbers: {
          include: {
            displayCompany: { select: { code: true, name: true } },
            wallet: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }
}
