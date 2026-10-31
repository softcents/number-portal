import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProviders() {
    const p = this.prisma as any;
    try {
      const DEFAULT_PROVIDERS = [
        {
          code: 'ICC',
          name: 'ICC Admin Panel',
          loginUrl: 'https://iccfios.net/icc-form/index.php/admin/login',
          notes: 'ICC provider — auto-login httpx session via Python worker',
        },
        {
          code: 'ICON',
          name: 'ICON Infotech Admin',
          loginUrl: 'http://iptspkyc.icon-infotech.net:81/login/',
          notes: 'ICON provider — short code 09644',
        },
        {
          code: 'RANKSITT',
          name: 'Ranksitt Admin Panel',
          loginUrl: '',
          notes: 'Ranksitt provider — short code 09617',
        },
      ];

      for (const dp of DEFAULT_PROVIDERS) {
        const existing = await p.provider.findFirst({
          where: {
            OR: [
              { code: dp.code },
              ...(dp.code === 'RANKSITT' ? [{ code: 'RANKS' }] : []),
            ],
          },
        });
        if (!existing) {
          await p.provider.create({
            data: {
              code: dp.code,
              name: dp.name,
              loginUrl: dp.loginUrl,
              isActive: true,
              notes: dp.notes,
            },
          });
        } else if (dp.code === 'RANKSITT' && (existing.code !== 'RANKSITT' || existing.name !== dp.name)) {
          await p.provider.update({
            where: { id: existing.id },
            data: { code: 'RANKSITT', name: dp.name },
          });
        }
      }
    } catch {
      // Non-fatal
    }

    return await p.provider.findMany({
      include: {
        credential: { select: { username: true } },
        _count: { select: { numbers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProviderById(id: string) {
    const p = this.prisma as any;
    const provider = await p.provider.findUnique({
      where: { id },
      include: { credential: true, numbers: true },
    });
    if (!provider) throw new NotFoundException('Provider not found');
    return provider;
  }

  async updateProvider(id: string, body: any) {
    const p = this.prisma as any;
    const existing = await p.provider.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Provider not found');

    const updated = await p.provider.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.loginUrl !== undefined && { loginUrl: body.loginUrl?.trim() || null }),
        ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    if (body.username || body.password) {
      const cred = await p.providerCredential.findUnique({ where: { providerId: id } });
      const enc = body.password ? Buffer.from(body.password).toString('base64') : undefined;
      if (cred) {
        await p.providerCredential.update({
          where: { providerId: id },
          data: {
            ...(body.username && { username: body.username.trim() }),
            ...(enc && { encryptedPassword: enc }),
          },
        });
      } else if (body.username && body.password) {
        await p.providerCredential.create({
          data: { providerId: id, username: body.username.trim(), encryptedPassword: enc! },
        });
      }
    }

    return updated;
  }

  async deleteProvider(id: string) {
    const p = this.prisma as any;
    const count = await p.number.count({ where: { providerId: id } });
    if (count > 0) throw new BadRequestException(`Cannot delete: ${count} numbers assigned to this provider`);
    await p.provider.delete({ where: { id } });
    return { success: true };
  }
}
