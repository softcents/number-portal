import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async writeAudit(params: {
    actorType: string;
    actorId: string;
    action: string;
    resource: string;
    resourceId?: string;
    oldValue?: any;
    newValue?: any;
    reason?: string;
    source?: string;
    ipAddress?: string;
    metadata?: any;
  }) {
    try {
      await (this.prisma as any).systemAuditLog.create({
        data: {
          actorType: params.actorType,
          actorId: params.actorId,
          action: params.action,
          resource: params.resource,
          resourceId: params.resourceId || null,
          oldValue: params.oldValue ? JSON.parse(JSON.stringify(params.oldValue)) : null,
          newValue: params.newValue ? JSON.parse(JSON.stringify(params.newValue)) : null,
          reason: params.reason || null,
          source: params.source || 'system',
          ipAddress: params.ipAddress || null,
          metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : null,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to write audit log: ${err?.message}`);
    }
  }
}
