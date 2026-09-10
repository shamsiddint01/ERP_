import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateCompensationDto } from './dto/create-compensation.dto.js';
import type { QueryCompensationDto } from './dto/query-compensation.dto.js';
import type { UpdateCompensationDto } from './dto/update-compensation.dto.js';

const COMPENSATION_INCLUDE = {
  employee: { select: { id: true, employeeCode: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.EmployeeCompensationInclude;

/** One day before `date`, at the same UTC calendar boundary — used to close out the previous compensation record. */
function dayBefore(date: Date): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - 1);
  return result;
}

@Injectable()
export class CompensationService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('EmployeeCompensation', (id) => this.prisma.employeeCompensation.findUnique({ where: { id } }));
  }

  async findAll(query: QueryCompensationDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.EmployeeCompensationWhereInput = { employeeId: query.employeeId };

    const [items, total] = await Promise.all([
      this.prisma.employeeCompensation.findMany({
        where,
        include: COMPENSATION_INCLUDE,
        orderBy: { effectiveFrom: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employeeCompensation.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const compensation = await this.prisma.employeeCompensation.findUnique({ where: { id }, include: COMPENSATION_INCLUDE });
    if (!compensation) throw new NotFoundException('Compensation record not found');
    return compensation;
  }

  /** The compensation in force for an employee on a given date — null if none exists (e.g. hired but never assigned a salary). */
  async findEffectiveForEmployee(employeeId: string, asOfDate: Date, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.employeeCompensation.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: asOfDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOfDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  /** Creates a new compensation record and closes out whichever record was previously "current" for this employee. */
  async create(dto: CreateCompensationDto, userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee || employee.deletedAt) throw new NotFoundException('Employee not found');

    const effectiveFrom = new Date(dto.effectiveFrom);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.employeeCompensation.findFirst({
        where: { employeeId: dto.employeeId, effectiveTo: null },
      });
      if (current) {
        if (current.effectiveFrom >= effectiveFrom) {
          throw new ConflictException('A new compensation record must take effect after the current one started');
        }
        await tx.employeeCompensation.update({ where: { id: current.id }, data: { effectiveTo: dayBefore(effectiveFrom) } });
      }

      return tx.employeeCompensation.create({
        data: {
          employeeId: dto.employeeId,
          baseSalary: dto.baseSalary,
          salaryType: dto.salaryType,
          overtimeRate: dto.overtimeRate,
          effectiveFrom,
          notes: dto.notes,
          createdByUserId: userId,
        },
        include: COMPENSATION_INCLUDE,
      });
    });
  }

  async update(id: string, dto: UpdateCompensationDto) {
    await this.findOne(id);
    return this.prisma.employeeCompensation.update({ where: { id }, data: { notes: dto.notes }, include: COMPENSATION_INCLUDE });
  }

  async remove(id: string) {
    await this.findOne(id);
    const payrollCount = await this.prisma.payroll.count({ where: { compensationId: id } });
    if (payrollCount > 0) {
      throw new ConflictException('Cannot delete a compensation record that already has payroll history against it');
    }
    await this.prisma.employeeCompensation.delete({ where: { id } });
    return { id };
  }
}
