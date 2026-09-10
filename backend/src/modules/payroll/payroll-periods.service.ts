import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto.js';
import type { QueryPayrollPeriodDto } from './dto/query-payroll-period.dto.js';

@Injectable()
export class PayrollPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('PayrollPeriod', (id) => this.prisma.payrollPeriod.findUnique({ where: { id } }));
  }

  async findAll(query: QueryPayrollPeriodDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PayrollPeriodWhereInput = {
      status: query.status,
      ...(query.search && { name: { contains: query.search, mode: 'insensitive' } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.payrollPeriod.findMany({
        where,
        include: { _count: { select: { payrolls: true } } },
        orderBy: { periodStart: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payrollPeriod.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id },
      include: { _count: { select: { payrolls: true } } },
    });
    if (!period) throw new NotFoundException('Payroll period not found');
    return period;
  }

  async create(dto: CreatePayrollPeriodDto) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd <= periodStart) throw new BadRequestException('periodEnd must be after periodStart');

    const overlapping = await this.prisma.payrollPeriod.findFirst({
      where: { periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } },
    });
    if (overlapping) throw new ConflictException(`This period overlaps with existing period "${overlapping.name}"`);

    return this.prisma.payrollPeriod.create({ data: { name: dto.name, periodStart, periodEnd } });
  }

  /** Closes a period once all its payrolls are finalized — closed periods can no longer accept new payroll rows. */
  async close(id: string) {
    const period = await this.findOne(id);
    if (period.status === 'CLOSED') throw new ConflictException('Period is already closed');

    const unfinished = await this.prisma.payroll.count({
      where: { periodId: id, status: { in: ['DRAFT', 'CALCULATING', 'CALCULATED', 'APPROVED'] } },
    });
    if (unfinished > 0) {
      throw new ConflictException('Cannot close a period that still has unpaid/uncancelled payroll rows');
    }

    return this.prisma.payrollPeriod.update({ where: { id }, data: { status: 'CLOSED' } });
  }

  async reopen(id: string) {
    const period = await this.findOne(id);
    if (period.status === 'OPEN') throw new ConflictException('Period is already open');
    return this.prisma.payrollPeriod.update({ where: { id }, data: { status: 'OPEN' } });
  }
}
