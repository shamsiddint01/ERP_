import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreatePositionDto } from './dto/create-position.dto.js';
import type { QueryPositionDto } from './dto/query-position.dto.js';
import type { UpdatePositionDto } from './dto/update-position.dto.js';

@Injectable()
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Position', (id) => this.prisma.position.findUnique({ where: { id } }));
  }

  async findAll(query: QueryPositionDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PositionWhereInput = {
      departmentId: query.departmentId,
      status: query.status,
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.position.findMany({
        where,
        include: { department: { select: { id: true, name: true, code: true } }, _count: { select: { employees: true } } },
        orderBy: { title: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.position.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const position = await this.prisma.position.findUnique({
      where: { id },
      include: { department: { select: { id: true, name: true, code: true } }, _count: { select: { employees: true } } },
    });
    if (!position) throw new NotFoundException('Position not found');
    return position;
  }

  async create(dto: CreatePositionDto) {
    const existing = await this.prisma.position.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Position code ${dto.code} is already in use`);

    const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!department) throw new NotFoundException('Department not found');

    return this.prisma.position.create({
      data: { title: dto.title, code: dto.code, description: dto.description, departmentId: dto.departmentId },
    });
  }

  async update(id: string, dto: UpdatePositionDto) {
    await this.findOne(id);

    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!department) throw new NotFoundException('Department not found');
    }

    if (dto.status === 'INACTIVE') {
      const activeEmployees = await this.prisma.employee.count({ where: { positionId: id, status: 'ACTIVE', deletedAt: null } });
      if (activeEmployees > 0) throw new ConflictException('Cannot deactivate a position that still has active employees');
    }

    return this.prisma.position.update({
      where: { id },
      data: { title: dto.title, description: dto.description, departmentId: dto.departmentId, status: dto.status },
    });
  }

  async remove(id: string) {
    return this.update(id, { status: 'INACTIVE' });
  }
}
