import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateCourseDto } from './dto/create-course.dto.js';
import type { QueryCourseDto } from './dto/query-course.dto.js';
import type { UpdateCourseDto } from './dto/update-course.dto.js';

const SORTABLE_FIELDS = new Set(['name', 'code', 'createdAt', 'defaultTuition', 'status']);

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Course', (id) => this.prisma.course.findUnique({ where: { id } }));
  }

  async findAll(query: QueryCourseDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy && SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : 'name';
    const sortDir = query.sortDir ?? 'asc';

    const where: Prisma.CourseWhereInput = {
      categoryId: query.categoryId,
      status: query.status,
      level: query.level,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        include: { category: { select: { id: true, name: true, code: true } }, _count: { select: { studentGroups: true } } },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.course.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true, code: true } }, _count: { select: { studentGroups: true } } },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async create(dto: CreateCourseDto) {
    await this.assertReferencesValid(dto);

    const existing = await this.prisma.course.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Course code "${dto.code}" is already in use`);

    return this.prisma.course.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        level: dto.level,
        durationWeeks: dto.durationWeeks,
        lessonDurationMinutes: dto.lessonDurationMinutes,
        defaultTuition: dto.defaultTuition,
        status: dto.status,
      },
      include: { category: { select: { id: true, name: true, code: true } } },
    });
  }

  async update(id: string, dto: UpdateCourseDto) {
    await this.findOne(id);
    await this.assertReferencesValid(dto);

    if (dto.code) {
      const existing = await this.prisma.course.findUnique({ where: { code: dto.code } });
      if (existing && existing.id !== id) throw new ConflictException(`Course code "${dto.code}" is already in use`);
    }

    if (dto.status === 'INACTIVE') {
      await this.assertNotReferenced(id);
    }

    return this.prisma.course.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        level: dto.level,
        durationWeeks: dto.durationWeeks,
        lessonDurationMinutes: dto.lessonDurationMinutes,
        defaultTuition: dto.defaultTuition,
        status: dto.status,
      },
      include: { category: { select: { id: true, name: true, code: true } } },
    });
  }

  /** No hard delete — "removing" a course deactivates it, guarded against StudentGroup/Enrollment references. */
  async remove(id: string) {
    return this.update(id, { status: 'INACTIVE' });
  }

  private async assertReferencesValid(dto: Partial<CreateCourseDto>): Promise<void> {
    if (dto.categoryId) {
      const category = await this.prisma.courseCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Course category not found');
    }
  }

  /** A StudentGroup's courseId is required (non-nullable) — any group referencing this course would block a hard delete at the DB level; Enrollment reaches the course transitively through its group. */
  private async assertNotReferenced(id: string): Promise<void> {
    const groupCount = await this.prisma.studentGroup.count({ where: { courseId: id } });
    if (groupCount > 0) {
      throw new ConflictException('Cannot deactivate a course that still has student groups (and their enrollments) referencing it');
    }
  }
}
