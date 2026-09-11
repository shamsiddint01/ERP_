import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateCourseCategoryDto } from './dto/create-course-category.dto.js';
import type { QueryCourseCategoryDto } from './dto/query-course-category.dto.js';
import type { UpdateCourseCategoryDto } from './dto/update-course-category.dto.js';

const SORTABLE_FIELDS = new Set(['name', 'code', 'createdAt']);

@Injectable()
export class CourseCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('CourseCategory', (id) => this.prisma.courseCategory.findUnique({ where: { id } }));
  }

  async findAll(query: QueryCourseCategoryDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy && SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : 'name';
    const sortDir = query.sortDir ?? 'asc';

    const where: Prisma.CourseCategoryWhereInput = {
      status: query.status,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.courseCategory.findMany({
        where,
        include: { _count: { select: { courses: true } } },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.courseCategory.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const category = await this.prisma.courseCategory.findUnique({
      where: { id },
      include: { _count: { select: { courses: true } } },
    });
    if (!category) throw new NotFoundException('Course category not found');
    return category;
  }

  async create(dto: CreateCourseCategoryDto) {
    const existing = await this.prisma.courseCategory.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Course category code "${dto.code}" is already in use`);

    return this.prisma.courseCategory.create({
      data: { name: dto.name, code: dto.code, description: dto.description, status: dto.status },
    });
  }

  async update(id: string, dto: UpdateCourseCategoryDto) {
    await this.findOne(id);

    if (dto.code) {
      const existing = await this.prisma.courseCategory.findUnique({ where: { code: dto.code } });
      if (existing && existing.id !== id) throw new ConflictException(`Course category code "${dto.code}" is already in use`);
    }

    if (dto.status === 'INACTIVE') {
      const courseCount = await this.prisma.course.count({ where: { categoryId: id } });
      if (courseCount > 0) throw new ConflictException('Cannot deactivate a category that still has courses assigned to it');
    }

    return this.prisma.courseCategory.update({
      where: { id },
      data: { name: dto.name, code: dto.code, description: dto.description, status: dto.status },
    });
  }

  /** No hard delete for a lookup entity with dependents — mirrors Department/Position: "removing" a category deactivates it, guarded by the same dependent check as a direct status PATCH. */
  async remove(id: string) {
    return this.update(id, { status: 'INACTIVE' });
  }
}
