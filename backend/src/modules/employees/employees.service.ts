import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { generateDocumentNumber } from '../../shared/utils/document-number.util.js';
import type { CreateEmployeeDto } from './dto/create-employee.dto.js';
import type { QueryEmployeeDto } from './dto/query-employee.dto.js';
import type { UpdateEmployeeDto } from './dto/update-employee.dto.js';

const EMPLOYEE_LIST_INCLUDE = {
  department: { select: { id: true, name: true, code: true } },
  position: { select: { id: true, title: true, code: true } },
} satisfies Prisma.EmployeeInclude;

const EMPLOYEE_DETAIL_INCLUDE = {
  department: { select: { id: true, name: true, code: true } },
  position: { select: { id: true, title: true, code: true } },
  manager: { select: { id: true, employeeCode: true, fullName: true } },
  directReports: { select: { id: true, employeeCode: true, fullName: true, status: true } },
  /// Only the fields safe to surface — never leak passwordHash or session data via this relation.
  user: { select: { id: true, username: true, fullName: true, status: true, lastActiveAt: true } },
} satisfies Prisma.EmployeeInclude;

function buildFullName(firstName: string, lastName: string, middleName?: string | null): string {
  return [firstName, middleName, lastName].filter(Boolean).join(' ');
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Employee', (id) => this.prisma.employee.findUnique({ where: { id } }));
  }

  async findAll(query: QueryEmployeeDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      departmentId: query.departmentId,
      positionId: query.positionId,
      status: query.status,
      ...(query.search && {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { employeeCode: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: EMPLOYEE_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id }, include: EMPLOYEE_DETAIL_INCLUDE });
    if (!employee || employee.deletedAt) throw new NotFoundException('Employee not found');
    return employee;
  }

  /** Real KPI figures for the Employees dashboard — grouped straight from the database, never hand-maintained counters. */
  async getOverview() {
    const [statusCounts, departmentCount, recentEmployees] = await Promise.all([
      this.prisma.employee.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
      this.prisma.department.count({ where: { status: 'ACTIVE' } }),
      this.prisma.employee.findMany({
        where: { deletedAt: null },
        include: EMPLOYEE_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const countFor = (status: string) => statusCounts.find((s) => s.status === status)?._count ?? 0;
    const totalEmployees = statusCounts.reduce((sum, s) => sum + s._count, 0);

    return {
      totalEmployees,
      activeCount: countFor('ACTIVE'),
      onLeaveCount: countFor('ON_LEAVE'),
      suspendedCount: countFor('SUSPENDED'),
      terminatedCount: countFor('TERMINATED'),
      departmentCount,
      recentEmployees,
    };
  }

  /** Real cross-module activity — attendance summary, responsible orders/expenses, audit history — never mock data. */
  async getActivity(id: string) {
    await this.findOne(id);

    const [attendanceRecords, orders, expenses, activity] = await Promise.all([
      this.prisma.attendanceRecord.findMany({ where: { employeeId: id }, orderBy: { workDate: 'desc' }, take: 30 }),
      this.prisma.order.findMany({
        where: { responsibleEmployeeId: id },
        select: { id: true, orderNumber: true, status: true, grandTotal: true, orderDate: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.expense.findMany({
        where: { responsibleEmployeeId: id },
        select: { id: true, expenseNumber: true, status: true, amount: true, expenseDate: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.auditLog.findMany({
        where: { entityType: 'Employee', entityId: id },
        include: { actor: { select: { id: true, fullName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const presentCount = attendanceRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const lateCount = attendanceRecords.filter((r) => r.status === 'LATE').length;
    const absentCount = attendanceRecords.filter((r) => r.status === 'ABSENT').length;
    const totalOvertimeMinutes = attendanceRecords.reduce((sum, r) => sum + r.overtimeMinutes, 0);

    return {
      attendanceRecords,
      attendanceSummary: { presentCount, lateCount, absentCount, totalOvertimeMinutes, recordCount: attendanceRecords.length },
      orders,
      expenses,
      activity,
    };
  }

  async create(dto: CreateEmployeeDto) {
    await this.assertReferencesValid(dto);

    const employeeCode = await generateDocumentNumber('EMP', () => this.prisma.employee.count());
    return this.prisma.employee.create({
      data: {
        employeeCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        fullName: buildFullName(dto.firstName, dto.lastName, dto.middleName),
        phone: dto.phone,
        email: dto.email,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        address: dto.address,
        departmentId: dto.departmentId,
        positionId: dto.positionId,
        managerId: dto.managerId,
        hireDate: new Date(dto.hireDate),
        salary: dto.salary,
        notes: dto.notes,
      },
      include: EMPLOYEE_DETAIL_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const employee = await this.findOne(id);
    if (employee.status === 'TERMINATED') {
      throw new ConflictException('This employee is terminated — reactivate before making further changes');
    }
    if (dto.managerId === id) throw new BadRequestException('An employee cannot be their own manager');
    await this.assertReferencesValid(dto);

    const firstName = dto.firstName ?? employee.firstName;
    const lastName = dto.lastName ?? employee.lastName;
    const middleName = dto.middleName !== undefined ? dto.middleName : employee.middleName;

    return this.prisma.employee.update({
      where: { id },
      data: {
        firstName,
        lastName,
        middleName,
        fullName: buildFullName(firstName, lastName, middleName),
        phone: dto.phone,
        email: dto.email,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        address: dto.address,
        departmentId: dto.departmentId,
        positionId: dto.positionId,
        managerId: dto.managerId,
        salary: dto.salary,
        notes: dto.notes,
        status: dto.status,
      },
      include: EMPLOYEE_DETAIL_INCLUDE,
    });
  }

  /**
   * "Delete" = terminate: soft-deletes the employee, frees up any department
   * they managed, and deactivates their linked system User (if any) so
   * access is revoked the moment employment ends. Every step happens in one
   * transaction so a partial termination can never occur.
   */
  async remove(id: string) {
    const employee = await this.findOne(id);
    if (employee.status === 'TERMINATED') throw new ConflictException('Employee is already terminated');

    return this.prisma.$transaction(async (tx) => {
      await tx.department.updateMany({ where: { managerEmployeeId: id }, data: { managerEmployeeId: null } });

      if (employee.user) {
        await tx.user.update({ where: { id: employee.user.id }, data: { status: 'INACTIVE', deletedAt: new Date() } });
      }

      const updateResult = await tx.employee.updateMany({
        where: { id, status: employee.status },
        data: { status: 'TERMINATED', terminationDate: new Date(), deletedAt: new Date() },
      });
      if (updateResult.count === 0) {
        throw new ConflictException('Employee status was changed concurrently — please retry');
      }
      return tx.employee.findUniqueOrThrow({ where: { id }, include: EMPLOYEE_DETAIL_INCLUDE });
    });
  }

  /** The one dedicated path back from TERMINATED — deliberately separate from the generic update() so it can never happen by accident via a plain PATCH. */
  async reactivate(id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.status !== 'TERMINATED') throw new ConflictException('Only a TERMINATED employee can be reactivated');

    const updateResult = await this.prisma.employee.updateMany({
      where: { id, status: employee.status },
      data: { status: 'ACTIVE', terminationDate: null, deletedAt: null },
    });
    if (updateResult.count === 0) throw new ConflictException('Employee status was changed concurrently — please retry');
    return this.prisma.employee.findUniqueOrThrow({ where: { id }, include: EMPLOYEE_DETAIL_INCLUDE });
  }

  private async assertReferencesValid(dto: Partial<CreateEmployeeDto>): Promise<void> {
    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!department) throw new NotFoundException('Department not found');
    }
    if (dto.positionId) {
      const position = await this.prisma.position.findUnique({ where: { id: dto.positionId } });
      if (!position) throw new NotFoundException('Position not found');
      if (dto.departmentId && position.departmentId !== dto.departmentId) {
        throw new BadRequestException('The selected position does not belong to the selected department');
      }
    }
    if (dto.managerId) {
      const manager = await this.prisma.employee.findUnique({ where: { id: dto.managerId } });
      if (!manager || manager.deletedAt) throw new NotFoundException('Manager employee not found');
    }
  }
}
