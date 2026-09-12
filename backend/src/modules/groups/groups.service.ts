import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateGroupDto } from './dto/create-group.dto.js';
import type { QueryGroupDto } from './dto/query-group.dto.js';
import type { UpdateGroupDto } from './dto/update-group.dto.js';

const SORTABLE_FIELDS = new Set(['name', 'code', 'startDate', 'capacity', 'status', 'createdAt']);

const GROUP_LIST_INCLUDE = {
  course: { select: { id: true, name: true, code: true } },
  branch: { select: { id: true, name: true, code: true } },
  classroom: { select: { id: true, name: true, roomNumber: true } },
  teacherEmployee: { select: { id: true, fullName: true } },
  _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.StudentGroupInclude;

const GROUP_DETAIL_INCLUDE = {
  ...GROUP_LIST_INCLUDE,
  enrollments: {
    include: { student: { select: { id: true, studentCode: true, fullName: true, status: true } } },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.StudentGroupInclude;

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('StudentGroup', (id) => this.prisma.studentGroup.findUnique({ where: { id } }));
  }

  async findAll(query: QueryGroupDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy && SORTABLE_FIELDS.has(query.sortBy) ? query.sortBy : 'startDate';
    const sortDir = query.sortDir ?? 'desc';

    const where: Prisma.StudentGroupWhereInput = {
      courseId: query.courseId,
      branchId: query.branchId,
      classroomId: query.classroomId,
      teacherEmployeeId: query.teacherEmployeeId,
      status: query.status,
      level: query.level,
      ...((query.startFrom || query.startTo) && {
        startDate: {
          gte: query.startFrom ? new Date(query.startFrom) : undefined,
          lte: query.startTo ? new Date(query.startTo) : undefined,
        },
      }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [groups, total] = await Promise.all([
      this.prisma.studentGroup.findMany({
        where,
        include: GROUP_LIST_INCLUDE,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.studentGroup.count({ where }),
    ]);

    const items = groups.map((group) => this.withSeatInfo(group));
    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const group = await this.prisma.studentGroup.findUnique({ where: { id }, include: GROUP_DETAIL_INCLUDE });
    if (!group) throw new NotFoundException('Group not found');
    return this.withSeatInfo(group);
  }

  async create(dto: CreateGroupDto) {
    await this.assertReferencesValid(dto);
    this.assertDatesValid(dto.startDate, dto.endDate);

    const existingCode = await this.prisma.studentGroup.findUnique({ where: { code: dto.code } });
    if (existingCode) throw new ConflictException(`Group code "${dto.code}" is already in use`);

    return this.prisma.$transaction(async (tx) => {
      if (dto.teacherEmployeeId) await this.assertActiveTeacher(tx, dto.teacherEmployeeId);

      const group = await tx.studentGroup.create({
        data: {
          code: dto.code,
          name: dto.name,
          courseId: dto.courseId,
          branchId: dto.branchId,
          classroomId: dto.classroomId,
          teacherEmployeeId: dto.teacherEmployeeId,
          capacity: dto.capacity,
          tuitionAmount: dto.tuitionAmount,
          level: dto.level,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          status: dto.status,
          notes: dto.notes,
        },
        include: GROUP_DETAIL_INCLUDE,
      });
      return this.withSeatInfo(group);
    });
  }

  async update(id: string, dto: UpdateGroupDto) {
    const group = await this.findOne(id);
    const effectiveBranchId = dto.branchId ?? group.branchId;
    await this.assertReferencesValid({ ...dto, branchId: effectiveBranchId });
    this.assertDatesValid(
      dto.startDate ?? group.startDate.toISOString(),
      dto.endDate ?? group.endDate?.toISOString() ?? undefined,
    );

    if (dto.code) {
      const existingCode = await this.prisma.studentGroup.findUnique({ where: { code: dto.code } });
      if (existingCode && existingCode.id !== id) throw new ConflictException(`Group code "${dto.code}" is already in use`);
    }

    if (dto.status === 'CANCELLED') {
      const activeCount = await this.prisma.enrollment.count({ where: { groupId: id, status: 'ACTIVE' } });
      if (activeCount > 0) {
        throw new ConflictException('Cannot cancel a group that still has active enrollments — transfer or complete them first');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.teacherEmployeeId) await this.assertActiveTeacher(tx, dto.teacherEmployeeId);

      const updated = await tx.studentGroup.update({
        where: { id },
        data: {
          code: dto.code,
          name: dto.name,
          courseId: dto.courseId,
          branchId: dto.branchId,
          classroomId: dto.classroomId,
          teacherEmployeeId: dto.teacherEmployeeId,
          capacity: dto.capacity,
          tuitionAmount: dto.tuitionAmount,
          level: dto.level,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          status: dto.status,
          notes: dto.notes,
        },
        include: GROUP_DETAIL_INCLUDE,
      });
      return this.withSeatInfo(updated);
    });
  }

  /** No hard delete — mirrors every other lookup entity in this system: "removing" a group cancels it, guarded against active enrollments. */
  async remove(id: string) {
    return this.update(id, { status: 'CANCELLED' });
  }

  private withSeatInfo<T extends { capacity: number; _count: { enrollments: number } }>(group: T) {
    const enrolledCount = group._count.enrollments;
    return { ...group, enrolledCount, availableSeats: group.capacity - enrolledCount };
  }

  private async assertReferencesValid(dto: Partial<CreateGroupDto> & { branchId?: string }): Promise<void> {
    if (dto.courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: dto.courseId } });
      if (!course) throw new NotFoundException('Course not found');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) throw new NotFoundException('Branch not found');
    }
    if (dto.classroomId) {
      const classroom = await this.prisma.classroom.findUnique({ where: { id: dto.classroomId } });
      if (!classroom) throw new NotFoundException('Classroom not found');
      if (dto.branchId && classroom.branchId !== dto.branchId) {
        throw new BadRequestException('Selected classroom does not belong to the selected branch');
      }
    }
  }

  private assertDatesValid(startDate: string, endDate?: string): void {
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) throw new BadRequestException('Invalid start date');
    if (endDate) {
      const end = new Date(endDate);
      if (Number.isNaN(end.getTime())) throw new BadRequestException('Invalid end date');
      if (end < start) throw new BadRequestException('End date must not be before the start date');
    }
  }

  /**
   * A group's teacher must be an Employee with an ACTIVE TeacherProfile — never
   * an arbitrary staff member (Phase D §8). Locks the profile row for the rest
   * of the transaction so a concurrent deactivation can't race past this check
   * (Phase D §39): TeachersService.update() takes a real row-level UPDATE lock
   * on that same row, so the two always serialize against each other.
   */
  private async assertActiveTeacher(tx: Prisma.TransactionClient, employeeId: string): Promise<void> {
    const employee = await tx.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.deletedAt) throw new NotFoundException('Teacher employee not found');

    // employee_id is a plain TEXT column (Prisma models String @id as text,
    // not a native Postgres uuid type) — no ::uuid cast, or Postgres refuses
    // the comparison with "operator does not exist: text = uuid".
    const rows = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM teacher_profiles WHERE employee_id = ${employeeId} FOR UPDATE
    `;
    const profile = rows[0];
    if (!profile || profile.status !== 'ACTIVE') {
      throw new ConflictException('Selected employee is not an active teacher — create or activate their teacher profile first');
    }
  }
}
