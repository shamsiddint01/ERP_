import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateExtraLessonDto } from './dto/create-extra-lesson.dto.js';
import type { QueryExtraLessonDto } from './dto/query-extra-lesson.dto.js';
import type { UpdateExtraLessonDto } from './dto/update-extra-lesson.dto.js';

export const EXTRA_LESSON_INCLUDE = {
  teacherEmployee: { select: { id: true, fullName: true } },
  course: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  _count: { select: { registrations: true } },
} satisfies Prisma.ExtraLessonInclude;

@Injectable()
export class ExtraLessonsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('ExtraLesson', (id) => this.prisma.extraLesson.findUnique({ where: { id } }));
  }

  async findAll(query: QueryExtraLessonDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ExtraLessonWhereInput = {
      status: query.status,
      ...(query.upcoming && { startsAt: { gte: new Date() } }),
      ...(query.search && { title: { contains: query.search, mode: 'insensitive' } }),
    };
    const [items, total] = await Promise.all([
      this.prisma.extraLesson.findMany({
        where,
        include: EXTRA_LESSON_INCLUDE,
        orderBy: { startsAt: query.upcoming ? 'asc' : 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.extraLesson.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const lesson = await this.prisma.extraLesson.findUnique({
      where: { id },
      include: {
        ...EXTRA_LESSON_INCLUDE,
        registrations: { include: { student: { select: { id: true, fullName: true, studentCode: true, phone: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!lesson) throw new NotFoundException('Extra lesson not found');
    return lesson;
  }

  async create(dto: CreateExtraLessonDto, actorUserId: string) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertTimes(startsAt, endsAt);
    await this.assertReferences(dto);
    return this.prisma.extraLesson.create({
      data: {
        title: dto.title.trim(),
        description: dto.description,
        teacherEmployeeId: dto.teacherEmployeeId,
        courseId: dto.courseId,
        branchId: dto.branchId,
        room: dto.room,
        startsAt,
        endsAt,
        capacity: dto.capacity,
        createdByUserId: actorUserId,
      },
      include: EXTRA_LESSON_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateExtraLessonDto) {
    const lesson = await this.prisma.extraLesson.findUnique({ where: { id }, include: { _count: { select: { registrations: true } } } });
    if (!lesson) throw new NotFoundException('Extra lesson not found');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : lesson.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : lesson.endsAt;
    this.assertTimes(startsAt, endsAt);
    if (dto.capacity !== undefined && dto.capacity < lesson._count.registrations) {
      throw new ConflictException(`Capacity cannot be lower than the ${lesson._count.registrations} students already registered`);
    }
    await this.assertReferences(dto);
    return this.prisma.extraLesson.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description,
        teacherEmployeeId: dto.teacherEmployeeId,
        courseId: dto.courseId,
        branchId: dto.branchId,
        room: dto.room,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        capacity: dto.capacity,
        status: dto.status,
      },
      include: EXTRA_LESSON_INCLUDE,
    });
  }

  /** Hard delete only while nobody has signed up — otherwise cancel it (status CANCELLED) so registered students see what happened. */
  async remove(id: string) {
    const lesson = await this.prisma.extraLesson.findUnique({ where: { id }, include: { _count: { select: { registrations: true } } } });
    if (!lesson) throw new NotFoundException('Extra lesson not found');
    if (lesson._count.registrations > 0) throw new ConflictException('Students are already registered — cancel the lesson instead of deleting it');
    await this.prisma.extraLesson.delete({ where: { id } });
    return { id };
  }

  private assertTimes(startsAt: Date, endsAt: Date) {
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new BadRequestException('Invalid date');
    if (endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt');
  }

  private async assertReferences(dto: { teacherEmployeeId?: string; courseId?: string; branchId?: string }) {
    if (dto.teacherEmployeeId) {
      const profile = await this.prisma.teacherProfile.findUnique({ where: { employeeId: dto.teacherEmployeeId }, select: { status: true } });
      if (!profile || profile.status !== 'ACTIVE') throw new BadRequestException('Teacher not found or inactive');
    }
    if (dto.courseId && !(await this.prisma.course.findUnique({ where: { id: dto.courseId }, select: { id: true } }))) {
      throw new NotFoundException('Course not found');
    }
    if (dto.branchId && !(await this.prisma.branch.findUnique({ where: { id: dto.branchId }, select: { id: true } }))) {
      throw new NotFoundException('Branch not found');
    }
  }
}
