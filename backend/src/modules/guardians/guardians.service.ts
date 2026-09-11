import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateGuardianDto } from './dto/create-guardian.dto.js';
import type { QueryGuardianDto } from './dto/query-guardian.dto.js';
import type { UpdateGuardianDto } from './dto/update-guardian.dto.js';

const GUARDIAN_DETAIL_INCLUDE = {
  students: {
    include: {
      student: {
        select: { id: true, studentCode: true, fullName: true, status: true, branch: { select: { id: true, name: true } } },
      },
    },
    orderBy: { isPrimary: 'desc' },
  },
} satisfies Prisma.GuardianInclude;

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Guardian', (id) => this.prisma.guardian.findUnique({ where: { id } }));
  }

  async findAll(query: QueryGuardianDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.GuardianWhereInput = {
      status: query.status,
      ...(query.search && {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.guardian.findMany({
        where,
        include: { _count: { select: { students: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.guardian.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const guardian = await this.prisma.guardian.findUnique({ where: { id }, include: GUARDIAN_DETAIL_INCLUDE });
    if (!guardian) throw new NotFoundException('Guardian not found');
    return guardian;
  }

  create(dto: CreateGuardianDto) {
    return this.prisma.guardian.create({ data: dto, include: GUARDIAN_DETAIL_INCLUDE });
  }

  async update(id: string, dto: UpdateGuardianDto) {
    await this.findOne(id);
    return this.prisma.guardian.update({ where: { id }, data: dto, include: GUARDIAN_DETAIL_INCLUDE });
  }

  /** No deletedAt column (Phase A) — mirrors Department/Student: "removing" a guardian marks it INACTIVE, preserving StudentGuardian history. */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.guardian.update({ where: { id }, data: { status: 'INACTIVE' }, include: GUARDIAN_DETAIL_INCLUDE });
  }
}
