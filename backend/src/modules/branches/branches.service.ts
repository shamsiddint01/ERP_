import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateBranchDto } from './dto/create-branch.dto.js';
import type { QueryBranchDto } from './dto/query-branch.dto.js';
import type { UpdateBranchDto } from './dto/update-branch.dto.js';

const SORTABLE_FIELDS = new Set(['name', 'code', 'createdAt', 'status']);

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Branch', (id) => this.prisma.branch.findUnique({ where: { id } }));
  }

  async findAll(query: QueryBranchDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy && SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : 'name';
    const sortDir = query.sortDir ?? 'asc';

    const where: Prisma.BranchWhereInput = {
      status: query.status,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
          { address: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [branches, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        include: {
          managerEmployee: { select: { id: true, fullName: true } },
          _count: { select: { classrooms: true, students: true, studentGroups: true } },
        },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.branch.count({ where }),
    ]);

    return { items: branches, total, page, pageSize };
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        managerEmployee: { select: { id: true, fullName: true } },
        classrooms: { select: { id: true, name: true, roomNumber: true, capacity: true, status: true } },
        _count: { select: { students: true } },
      },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const activeGroupCount = await this.prisma.studentGroup.count({ where: { branchId: id, status: 'ACTIVE' } });
    return { ...branch, activeGroupCount };
  }

  async create(dto: CreateBranchDto) {
    await this.assertReferencesValid(dto);

    const existing = await this.prisma.branch.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Branch code "${dto.code}" is already in use`);

    return this.prisma.branch.create({
      data: {
        name: dto.name,
        code: dto.code,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        managerEmployeeId: dto.managerEmployeeId,
        workingHours: dto.workingHours,
        notes: dto.notes,
        status: dto.status,
      },
    });
  }

  async update(id: string, dto: UpdateBranchDto) {
    await this.findOne(id);
    await this.assertReferencesValid(dto);

    if (dto.code) {
      const existing = await this.prisma.branch.findUnique({ where: { code: dto.code } });
      if (existing && existing.id !== id) throw new ConflictException(`Branch code "${dto.code}" is already in use`);
    }

    if (dto.status === 'INACTIVE') {
      await this.assertNotReferenced(id);
    }

    return this.prisma.branch.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        managerEmployeeId: dto.managerEmployeeId,
        workingHours: dto.workingHours,
        notes: dto.notes,
        status: dto.status,
      },
    });
  }

  /** No hard delete — mirrors Department/Position: "removing" a branch deactivates it, guarded against classrooms/students/groups. */
  async remove(id: string) {
    return this.update(id, { status: 'INACTIVE' });
  }

  private async assertReferencesValid(dto: Partial<CreateBranchDto>): Promise<void> {
    if (dto.managerEmployeeId) {
      const manager = await this.prisma.employee.findUnique({ where: { id: dto.managerEmployeeId } });
      if (!manager || manager.deletedAt) throw new NotFoundException('Manager employee not found');
    }
  }

  private async assertNotReferenced(id: string): Promise<void> {
    const [classroomCount, studentCount, groupCount] = await Promise.all([
      this.prisma.classroom.count({ where: { branchId: id } }),
      this.prisma.student.count({ where: { branchId: id } }),
      this.prisma.studentGroup.count({ where: { branchId: id } }),
    ]);
    if (classroomCount > 0) throw new ConflictException('Cannot deactivate a branch that still has classrooms assigned to it');
    if (studentCount > 0) throw new ConflictException('Cannot deactivate a branch that still has students assigned to it');
    if (groupCount > 0) throw new ConflictException('Cannot deactivate a branch that still has student groups assigned to it');
  }
}
