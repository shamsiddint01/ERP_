import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateClassroomDto } from './dto/create-classroom.dto.js';
import type { QueryClassroomDto } from './dto/query-classroom.dto.js';
import type { UpdateClassroomDto } from './dto/update-classroom.dto.js';

const SORTABLE_FIELDS = new Set(['name', 'roomNumber', 'createdAt', 'status', 'capacity']);

@Injectable()
export class ClassroomsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Classroom', (id) => this.prisma.classroom.findUnique({ where: { id } }));
  }

  async findAll(query: QueryClassroomDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy && SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : 'roomNumber';
    const sortDir = query.sortDir ?? 'asc';

    const where: Prisma.ClassroomWhereInput = {
      branchId: query.branchId,
      status: query.status,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { roomNumber: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.classroom.findMany({
        where,
        include: { branch: { select: { id: true, name: true, code: true } }, _count: { select: { studentGroups: true } } },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.classroom.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id },
      include: { branch: { select: { id: true, name: true, code: true } }, _count: { select: { studentGroups: true } } },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
    return classroom;
  }

  async create(dto: CreateClassroomDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
    if (!branch) throw new NotFoundException('Branch not found');

    await this.assertRoomNumberAvailable(dto.branchId, dto.roomNumber, null);

    return this.prisma.classroom.create({
      data: {
        branchId: dto.branchId,
        name: dto.name,
        roomNumber: dto.roomNumber,
        capacity: dto.capacity,
        equipment: dto.equipment,
        notes: dto.notes,
        status: dto.status,
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  async update(id: string, dto: UpdateClassroomDto) {
    const classroom = await this.findOne(id);

    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) throw new NotFoundException('Branch not found');
    }

    if (dto.branchId || dto.roomNumber) {
      await this.assertRoomNumberAvailable(dto.branchId ?? classroom.branchId, dto.roomNumber ?? classroom.roomNumber, id);
    }

    if (dto.status === 'INACTIVE') {
      const groupCount = await this.prisma.studentGroup.count({ where: { classroomId: id } });
      if (groupCount > 0) throw new ConflictException('Cannot deactivate a classroom that still has student groups assigned to it');
    }

    return this.prisma.classroom.update({
      where: { id },
      data: {
        branchId: dto.branchId,
        name: dto.name,
        roomNumber: dto.roomNumber,
        capacity: dto.capacity,
        equipment: dto.equipment,
        notes: dto.notes,
        status: dto.status,
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  /** No hard delete — mirrors Department/Position: "removing" a classroom deactivates it, guarded against StudentGroup references. */
  async remove(id: string) {
    return this.update(id, { status: 'INACTIVE' });
  }

  private async assertRoomNumberAvailable(branchId: string, roomNumber: string, excludeId: string | null): Promise<void> {
    const existing = await this.prisma.classroom.findUnique({ where: { branchId_roomNumber: { branchId, roomNumber } } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Room "${roomNumber}" is already in use in this branch`);
    }
  }
}
