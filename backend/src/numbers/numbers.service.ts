import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

const VALID_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE:   ['RESERVED', 'ACTIVE', 'BLOCKED'],
  RESERVED:    ['AVAILABLE', 'PROCESSING', 'ACTIVE', 'BLOCKED'],
  PROCESSING:  ['ACTIVE', 'FAILED', 'AVAILABLE', 'BLOCKED'],
  ACTIVE:      ['SUSPENDED', 'RELEASED', 'AVAILABLE', 'BLOCKED'],
  SUSPENDED:   ['ACTIVE', 'AVAILABLE', 'BLOCKED'],
  RELEASED:    ['AVAILABLE', 'ACTIVE', 'BLOCKED'],
  FAILED:      ['AVAILABLE', 'ACTIVE', 'PROCESSING', 'BLOCKED'],
  BLOCKED:     ['AVAILABLE', 'ACTIVE'],
};

@Injectable()
export class NumbersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  normalizeNumber(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('880') && digits.length === 13) return digits;
    if (digits.startsWith('0') && digits.length === 11) return '880' + digits.slice(1);
    if (digits.length === 10) return '880' + digits;
    return digits;
  }

  canTransition(from: string, to: string): boolean {
    return (VALID_TRANSITIONS[from] ?? []).includes(to);
  }

  async getNumbers(params: {
    status?: string;
    numberType?: string;
    providerId?: string;
    displayCompanyId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, numberType, providerId, displayCompanyId, search, page = 1, limit = 50 } = params;
    const p = this.prisma as any;
    const where: any = {};

    if (status && status !== 'ALL') where.status = status;
    if (numberType) where.numberType = numberType;
    if (providerId) where.providerId = providerId;
    if (displayCompanyId) where.displayCompanyId = displayCompanyId;
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { normalizedNumber: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;
    const [total, rows] = await Promise.all([
      p.number.count({ where }),
      p.number.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          provider: { select: { id: true, code: true, name: true } },
          displayCompany: { select: { id: true, code: true, name: true } },
          customer: { select: { id: true, fullName: true, email: true } },
          wallet: { select: { id: true, balance: true, status: true } },
        },
      }),
    ]);

    return {
      total,
      rows,
      numbers: rows,
      page,
      pageSize: limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getNumberById(id: string) {
    const p = this.prisma as any;
    const num = await p.number.findUnique({
      where: { id },
      include: {
        provider: true,
        displayCompany: true,
        customer: true,
        wallet: true,
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 25 },
      },
    });
    if (!num) throw new NotFoundException('Number not found');
    return num;
  }

  async changeStatus(params: {
    numberId: string;
    toStatus: string;
    changedBy: string;
    reason?: string;
    source?: string;
    ipAddress?: string;
  }) {
    const { numberId, toStatus, changedBy, reason, source = 'system', ipAddress } = params;
    const p = this.prisma as any;

    const num = await p.number.findUnique({
      where: { id: numberId },
      select: { id: true, status: true, number: true },
    });

    if (!num) throw new NotFoundException('Number not found');
    if (!this.canTransition(num.status, toStatus)) {
      throw new BadRequestException(`Cannot transition from ${num.status} to ${toStatus}`);
    }

    await p.$transaction([
      p.number.update({
        where: { id: numberId },
        data: { status: toStatus, updatedAt: new Date() },
      }),
      p.numberStatusHistory.create({
        data: {
          numberId,
          fromStatus: num.status,
          toStatus,
          changedBy,
          reason: reason || null,
          source,
          ipAddress: ipAddress || null,
        },
      }),
    ]);

    await this.audit.writeAudit({
      actorType: 'admin',
      actorId: changedBy,
      action: 'STATUS_CHANGE',
      resource: 'number',
      resourceId: numberId,
      oldValue: { status: num.status },
      newValue: { status: toStatus },
      reason,
      ipAddress,
    });

    return { success: true, fromStatus: num.status, toStatus };
  }

  async createNumber(data: any, adminId: string, ipAddress?: string) {
    const normalized = this.normalizeNumber(data.number);
    const p = this.prisma as any;

    const existing = await p.number.findFirst({
      where: { OR: [{ number: data.number }, { normalizedNumber: normalized }] },
    });
    if (existing) {
      throw new BadRequestException(`Number ${data.number} already exists`);
    }

    const created = await p.number.create({
      data: {
        number: data.number.trim(),
        normalizedNumber: normalized,
        country: data.country || 'BD',
        countryCode: data.countryCode || '+880',
        city: data.city || null,
        area: data.area || null,
        numberType: data.numberType || 'MOBILE',
        callRate: data.callRate ? parseFloat(data.callRate) : null,
        costPrice: data.costPrice ? parseFloat(data.costPrice) : null,
        salePrice: data.salePrice ? parseFloat(data.salePrice) : null,
        providerId: data.providerId || null,
        providerReferenceId: data.providerReferenceId || null,
        displayCompanyId: data.displayCompanyId || null,
        status: 'AVAILABLE',
        notes: data.notes || null,
      },
    });

    await p.numberStatusHistory.create({
      data: {
        numberId: created.id,
        fromStatus: null,
        toStatus: 'AVAILABLE',
        changedBy: adminId,
        reason: 'Initial creation',
        source: 'admin_manual',
        ipAddress: ipAddress || null,
      },
    });

    await this.audit.writeAudit({
      actorType: 'admin',
      actorId: adminId,
      action: 'CREATE',
      resource: 'number',
      resourceId: created.id,
      newValue: created,
      ipAddress,
    });

    return created;
  }

  async updateNumber(id: string, data: any, adminId: string, ipAddress?: string) {
    const p = this.prisma as any;
    const existing = await p.number.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Number not found');

    if (data.status && data.status !== existing.status) {
      await this.changeStatus({
        numberId: id,
        toStatus: data.status,
        changedBy: adminId,
        reason: data.reason || 'Admin manual update',
        ipAddress,
      });
    }

    const updateData: any = {};
    const allowed = ['city', 'area', 'numberType', 'callRate', 'costPrice', 'salePrice',
                     'providerId', 'providerReferenceId', 'displayCompanyId', 'notes',
                     'activationStatus', 'country', 'countryCode'];
    for (const k of allowed) {
      if (data[k] !== undefined) updateData[k] = data[k] === '' ? null : data[k];
    }

    if (Object.keys(updateData).length > 0) {
      await p.number.update({ where: { id }, data: updateData });
    }

    return await this.getNumberById(id);
  }

  async deleteNumber(id: string, adminId: string, ipAddress?: string) {
    const p = this.prisma as any;
    const num = await p.number.findUnique({ where: { id } });
    if (!num) throw new NotFoundException('Number not found');
    await p.$transaction(async (tx: any) => {
      const wallets = await tx.numberWallet.findMany({ where: { numberId: id }, select: { id: true } });
      const walletIds = wallets.map((w: any) => w.id);
      if (walletIds.length > 0) {
        await tx.numberWalletTransaction.deleteMany({ where: { walletId: { in: walletIds } } });
      }
      await tx.numberWallet.deleteMany({ where: { numberId: id } });
      await tx.orderItem.deleteMany({ where: { numberId: id } });
      await tx.rechargeTransaction.deleteMany({ where: { numberId: id } });
      await tx.rechargeOrder.deleteMany({ where: { numberId: id } });
      await tx.numberImportRow.updateMany({ where: { numberId: id }, data: { numberId: null } });
      await tx.numberStatusHistory.deleteMany({ where: { numberId: id } });
      await tx.number.delete({ where: { id } });
    });
    await this.audit.writeAudit({
      actorType: 'admin',
      actorId: adminId,
      action: 'DELETE',
      resource: 'number',
      resourceId: id,
      oldValue: { number: num.number, status: num.status },
      ipAddress,
    });

    return { success: true };
  }

  async getNumberHistory(numberId: string) {
    const p = this.prisma as any;
    return await p.numberStatusHistory.findMany({
      where: { numberId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ─── Bulk CSV Import (Section 36) ──────────────────────────────────────────
  async previewImportCsv(params: {
    csvContent: string;
    filename?: string;
    adminId: string;
    ipAddress?: string;
  }) {
    const { csvContent, filename = 'numbers_import.csv', adminId } = params;
    const p = this.prisma as any;

    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length <= 1) {
      throw new BadRequestException('CSV file is empty or contains only headers');
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[\s_]+/g, ''));
    const rows = lines.slice(1);

    const importRecord = await p.numberImport.create({
      data: {
        filename,
        totalRows: rows.length,
        status: 'PENDING',
        importedBy: adminId,
      },
    });

    const parsedRows: any[] = [];
    let validCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;
    const seenInFile = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const cols = rows[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      const rowData: Record<string, string> = {};
      headers.forEach((h, idx) => {
        rowData[h] = cols[idx] || '';
      });

      const rawNumber = rowData['number'] || cols[0] || '';
      const normalized = this.normalizeNumber(rawNumber);

      let status = 'VALID';
      let errorMessage: string | null = null;

      if (!rawNumber || normalized.length < 10) {
        status = 'INVALID';
        errorMessage = 'Invalid phone number format';
        invalidCount++;
      } else if (seenInFile.has(normalized)) {
        status = 'DUPLICATE';
        errorMessage = 'Duplicate number within this CSV file';
        duplicateCount++;
      } else {
        seenInFile.add(normalized);
        const existing = await p.number.findFirst({
          where: { OR: [{ number: rawNumber }, { normalizedNumber: normalized }] },
          select: { id: true },
        });

        if (existing) {
          status = 'DUPLICATE';
          errorMessage = 'Number already exists in database';
          duplicateCount++;
        } else {
          validCount++;
        }
      }

      const importRow = await p.numberImportRow.create({
        data: {
          importId: importRecord.id,
          rowNumber: i + 1,
          rawData: rowData,
          normalizedNumber: normalized || null,
          status,
          errorMessage,
        },
      });

      parsedRows.push({
        id: importRow.id,
        rowNumber: i + 1,
        number: rawNumber,
        normalizedNumber: normalized,
        status,
        errorMessage,
        details: rowData,
      });
    }

    await p.numberImport.update({
      where: { id: importRecord.id },
      data: {
        validRows: validCount,
        duplicateRows: duplicateCount,
        invalidRows: invalidCount,
      },
    });

    return {
      importId: importRecord.id,
      filename,
      summary: {
        total: rows.length,
        valid: validCount,
        duplicate: duplicateCount,
        invalid: invalidCount,
      },
      previewRows: parsedRows.slice(0, 50),
    };
  }

  async confirmImportCsv(params: {
    importId: string;
    adminId: string;
    defaultProviderId?: string;
    defaultDisplayCompanyId?: string;
    ipAddress?: string;
  }) {
    const { importId, adminId, defaultProviderId, defaultDisplayCompanyId, ipAddress } = params;
    const p = this.prisma as any;

    const importRecord = await p.numberImport.findUnique({
      where: { id: importId },
      include: { rows: { where: { status: 'VALID' } } },
    });

    if (!importRecord) throw new NotFoundException('Import record not found');
    if (importRecord.status === 'COMPLETED') {
      throw new BadRequestException('This import has already been completed');
    }

    const validRows = importRecord.rows;
    let importedCount = 0;

    for (const row of validRows) {
      const data = row.rawData as any;
      const rawNumber = data.number || '';
      const normalized = row.normalizedNumber || this.normalizeNumber(rawNumber);

      const created = await p.number.create({
        data: {
          number: rawNumber,
          normalizedNumber: normalized,
          country: data.country || 'BD',
          countryCode: data.countrycode || '+880',
          city: data.city || null,
          area: data.area || null,
          numberType: data.numbertype || 'MOBILE',
          callRate: data.callrate ? parseFloat(data.callrate) : null,
          costPrice: data.costprice ? parseFloat(data.costprice) : null,
          salePrice: data.saleprice ? parseFloat(data.saleprice) : null,
          providerId: defaultProviderId || null,
          displayCompanyId: defaultDisplayCompanyId || null,
          status: 'AVAILABLE',
          notes: `Imported via CSV ${importRecord.filename}`,
        },
      });

      await p.numberImportRow.update({
        where: { id: row.id },
        data: { status: 'IMPORTED', numberId: created.id },
      });

      await p.numberStatusHistory.create({
        data: {
          numberId: created.id,
          fromStatus: null,
          toStatus: 'AVAILABLE',
          changedBy: adminId,
          reason: `Bulk import from ${importRecord.filename}`,
          source: 'bulk_import',
          ipAddress: ipAddress || null,
        },
      });

      importedCount++;
    }

    await p.numberImport.update({
      where: { id: importId },
      data: {
        status: 'COMPLETED',
        importedRows: importedCount,
        updatedAt: new Date(),
      },
    });

    await this.audit.writeAudit({
      actorType: 'admin',
      actorId: adminId,
      action: 'BULK_IMPORT_NUMBERS',
      resource: 'number_import',
      resourceId: importId,
      newValue: { importedCount, filename: importRecord.filename },
      ipAddress,
    });

    return {
      success: true,
      importId,
      importedCount,
      message: `Successfully imported ${importedCount} numbers`,
    };
  }
}
