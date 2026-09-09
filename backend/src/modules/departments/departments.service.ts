import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateDepartmentDto } from './dto/create-department.dto.js';
import type { QueryDepartmentDto } from './dto/query-department.dto.js';
import type { UpdateDepartmentDto } from './dto/update-department.dto.js';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Department', (id) => this.prisma.department.findUnique({ where: { id } }));
  }

  async findAll(query: QueryDepartmentDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.DepartmentWhereInput = {
      status: query.status,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [departments, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        include: { managerEmployee: { select: { id: true, fullName: true } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.department.count({ where }),
    ]);

    const counts = await this.prisma.employee.groupBy({
      by: ['departmentId', 'status'],
      where: { departmentId: { in: departments.map((d) => d.id) }, deletedAt: null },
      _count: true,
    });

    const items = departments.map((department) => {
      const departmentCounts = counts.filter((c) => c.departmentId === department.id);
      const activeCount = departmentCounts.filter((c) => c.status === 'ACTIVE').reduce((sum, c) => sum + c._count, 0);
      const totalCount = departmentCounts.reduce((sum, c) => sum + c._count, 0);
      return { ...department, employeeCount: totalCount, activeEmployeeCount: activeCount, inactiveEmployeeCount: totalCount - activeCount };
    });

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        managerEmployee: { select: { id: true, fullName: true } },
        positions: { select: { id: true, title: true, code: true, status: true } },
        employees: {
          where: { deletedAt: null },
          select: { id: true, employeeCode: true, fullName: true, status: true, position: { select: { id: true, title: true } } },
        },
      },
    });
    if (!department) throw new NotFoundException('Department not found');
    return department;
  }

  async create(dto: CreateDepartmentDto) {
    const existing = await this.prisma.department.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Department code ${dto.code} is already in use`);
    return this.prisma.department.create({ data: { name: dto.name, code: dto.code, description: dto.description } });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findOne(id);

    if (dto.managerEmployeeId) {
      const manager = await this.prisma.employee.findUnique({ where: { id: dto.managerEmployeeId } });
      if (!manager || manager.deletedAt) throw new NotFoundException('Manager employee not found');
      if (manager.departmentId !== id) {
        throw new BadRequestException('The department manager must belong to this department');
      }
    }

    if (dto.status === 'INACTIVE') {
      const activeEmployees = await this.prisma.employee.count({ where: { departmentId: id, status: 'ACTIVE', deletedAt: null } });
      if (activeEmployees > 0) throw new ConflictException('Cannot deactivate a department that still has active employees');
    }

    return this.prisma.department.update({
      where: { id },
      data: { name: dto.name, description: dto.description, status: dto.status, managerEmployeeId: dto.managerEmployeeId },
    });
  }

  async remove(id: string) {
    return this.update(id, { status: 'INACTIVE' });
  }
}
