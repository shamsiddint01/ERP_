import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { CreateEnrollmentDto } from './dto/create-enrollment.dto.js';
import type { QueryEnrollmentDto } from './dto/query-enrollment.dto.js';
import type { TransferEnrollmentDto } from './dto/transfer-enrollment.dto.js';
import type { UpdateEnrollmentDto } from './dto/update-enrollment.dto.js';

const ENROLLMENT_INCLUDE = {
  student: { select: { id: true, studentCode: true, fullName: true, status: true } },
  group: {
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      capacity: true,
      tuitionAmount: true,
      course: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true, code: true } },
      teacherEmployee: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.EnrollmentInclude;

/** A group in either of these states must never gain a new enrollment (Phase D §25). */
const CLOSED_GROUP_STATUSES = new Set(['COMPLETED', 'CANCELLED']);

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Enrollment', (id) => this.prisma.enrollment.findUnique({ where: { id } }));
  }

  async findAll(query: QueryEnrollmentDto): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const groupFilter: Prisma.StudentGroupWhereInput = {};
    if (query.courseId) groupFilter.courseId = query.courseId;
    if (query.branchId) groupFilter.branchId = query.branchId;
    if (query.teacherEmployeeId) groupFilter.teacherEmployeeId = query.teacherEmployeeId;

    const where: Prisma.EnrollmentWhereInput = {
      studentId: query.studentId,
      groupId: query.groupId,
      status: query.status,
      ...(Object.keys(groupFilter).length > 0 && { group: groupFilter }),
      ...((query.dateFrom || query.dateTo) && {
        startDate: {
          gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
          lte: query.dateTo ? new Date(query.dateTo) : undefined,
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        include: ENROLLMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id }, include: ENROLLMENT_INCLUDE });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    return enrollment;
  }

  /**
   * Concurrency-safe by design (Phase D §12/§38): capacity is always derived
   * from a live COUNT of ACTIVE enrollments, never a stored counter, so a
   * Postgres transaction-scoped advisory lock keyed on the group id
   * serializes concurrent attempts against the *same* group (different
   * groups never block each other) — the count-then-insert can't race.
   */
  async create(dto: CreateEnrollmentDto) {
    const student = await this.prisma.student.findUnique({ where: { id: dto.studentId } });
    if (!student) throw new NotFoundException('Student not found');

    const group = await this.prisma.studentGroup.findUnique({ where: { id: dto.groupId } });
    if (!group) throw new NotFoundException('Group not found');
    if (CLOSED_GROUP_STATUSES.has(group.status)) {
      throw new ConflictException(`Cannot enroll a student into a ${group.status.toLowerCase()} group`);
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = this.assertDatesValid(startDate, dto.endDate);
    const agreedTuition = dto.agreedTuition ?? (group.tuitionAmount !== null ? Number(group.tuitionAmount) : undefined);
    this.assertTuitionValid(agreedTuition, dto.discountAmount);

    return this.prisma.$transaction(async (tx) => {
      // $executeRaw, not $queryRaw: pg_advisory_xact_lock() returns void, which
      // Prisma's raw-query deserializer can't map to any column type — we only
      // need the locking side effect, never a return value.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('enrollment_group:' || ${dto.groupId}))`;

      const existingActive = await tx.enrollment.findFirst({
        where: { studentId: dto.studentId, groupId: dto.groupId, status: 'ACTIVE' },
      });
      if (existingActive) throw new ConflictException('This student already has an active enrollment in this group');

      const activeCount = await tx.enrollment.count({ where: { groupId: dto.groupId, status: 'ACTIVE' } });
      if (activeCount >= group.capacity) throw new ConflictException('This group is at full capacity');

      return tx.enrollment.create({
        data: {
          studentId: dto.studentId,
          groupId: dto.groupId,
          startDate,
          endDate,
          agreedTuition,
          discountAmount: dto.discountAmount,
          notes: dto.notes,
        },
        include: ENROLLMENT_INCLUDE,
      });
    });
  }

  async update(id: string, dto: UpdateEnrollmentDto) {
    const enrollment = await this.findOne(id);

    const startDate = dto.startDate ? new Date(dto.startDate) : enrollment.startDate;
    const endDate = this.assertDatesValid(startDate, dto.endDate ?? enrollment.endDate?.toISOString());
    const agreedTuition = dto.agreedTuition ?? (enrollment.agreedTuition !== null ? Number(enrollment.agreedTuition) : undefined);
    const discountAmount = dto.discountAmount ?? (enrollment.discountAmount !== null ? Number(enrollment.discountAmount) : undefined);
    this.assertTuitionValid(agreedTuition, discountAmount);

    return this.prisma.enrollment.update({
      where: { id },
      data: {
        startDate: dto.startDate ? startDate : undefined,
        endDate: dto.endDate ? endDate : undefined,
        agreedTuition: dto.agreedTuition,
        discountAmount: dto.discountAmount,
        notes: dto.notes,
      },
      include: ENROLLMENT_INCLUDE,
    });
  }

  /** Never a hard delete — historical enrollment must always remain (Phase D §18). "Removing" one just cancels it through the same guarded workflow transition. */
  async remove(id: string) {
    return this.cancel(id);
  }

  /**
   * Unlike pause/complete/cancel (which only ever leave ACTIVE), reactivating
   * a PAUSED enrollment re-enters the group's capacity pool — so it needs the
   * exact same advisory-lock + capacity/duplicate-active guard as create()
   * and transfer(), not the bare CAS that transitionTo() uses for the other
   * three transitions.
   */
  async activate(id: string) {
    const enrollment = await this.findOne(id);
    if (enrollment.status !== 'PAUSED') {
      throw new ConflictException(`Cannot move an enrollment from ${enrollment.status} to ACTIVE`);
    }
    const group = await this.prisma.studentGroup.findUnique({ where: { id: enrollment.groupId } });
    if (!group) throw new NotFoundException('Group not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('enrollment_group:' || ${enrollment.groupId}))`;

      const existingActive = await tx.enrollment.findFirst({
        where: { studentId: enrollment.studentId, groupId: enrollment.groupId, status: 'ACTIVE' },
      });
      if (existingActive) throw new ConflictException('This student already has another active enrollment in this group');

      const activeCount = await tx.enrollment.count({ where: { groupId: enrollment.groupId, status: 'ACTIVE' } });
      if (activeCount >= group.capacity) throw new ConflictException('This group is at full capacity');

      const result = await tx.enrollment.updateMany({ where: { id, status: 'PAUSED' }, data: { status: 'ACTIVE' } });
      if (result.count === 0) throw new ConflictException('This enrollment was changed concurrently — please retry');
    });

    return this.findOne(id);
  }

  async pause(id: string) {
    return this.transitionTo(id, ['ACTIVE'], 'PAUSED');
  }

  async complete(id: string) {
    return this.transitionTo(id, ['ACTIVE'], 'COMPLETED');
  }

  async cancel(id: string) {
    return this.transitionTo(id, ['ACTIVE', 'PAUSED'], 'CANCELLED');
  }

  /**
   * Moves a student from one group to another atomically (Phase D §19): the
   * old enrollment's CAS update and the new enrollment's creation share one
   * transaction, so a failure anywhere (capacity, duplicate, concurrent
   * change) rolls back everything — the student is never left half-
   * transferred. The target group's capacity is guarded by the exact same
   * advisory-lock mechanism as a plain create(), so a transfer and a fresh
   * enrollment racing for the same group's last seat still serialize
   * correctly against each other.
   */
  async transfer(id: string, dto: TransferEnrollmentDto) {
    const enrollment = await this.findOne(id);
    if (!['ACTIVE', 'PAUSED'].includes(enrollment.status)) {
      throw new ConflictException('Only an active or paused enrollment can be transferred');
    }
    if (dto.targetGroupId === enrollment.groupId) {
      throw new BadRequestException('The target group must be different from the current group');
    }

    const targetGroup = await this.prisma.studentGroup.findUnique({ where: { id: dto.targetGroupId } });
    if (!targetGroup) throw new NotFoundException('Target group not found');
    if (CLOSED_GROUP_STATUSES.has(targetGroup.status)) {
      throw new ConflictException(`Cannot transfer a student into a ${targetGroup.status.toLowerCase()} group`);
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    this.assertDatesValid(startDate);
    const agreedTuition =
      dto.agreedTuition ??
      (targetGroup.tuitionAmount !== null ? Number(targetGroup.tuitionAmount) : enrollment.agreedTuition !== null ? Number(enrollment.agreedTuition) : undefined);
    const discountAmount = dto.discountAmount ?? (enrollment.discountAmount !== null ? Number(enrollment.discountAmount) : undefined);
    this.assertTuitionValid(agreedTuition, discountAmount);

    const { oldEnrollmentId, newEnrollmentId } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('enrollment_group:' || ${dto.targetGroupId}))`;

      const oldResult = await tx.enrollment.updateMany({
        where: { id, status: enrollment.status },
        data: { status: 'TRANSFERRED' },
      });
      if (oldResult.count === 0) throw new ConflictException('This enrollment was changed concurrently — please retry');

      const existingActive = await tx.enrollment.findFirst({
        where: { studentId: enrollment.studentId, groupId: dto.targetGroupId, status: 'ACTIVE' },
      });
      if (existingActive) throw new ConflictException('This student already has an active enrollment in the target group');

      const activeCount = await tx.enrollment.count({ where: { groupId: dto.targetGroupId, status: 'ACTIVE' } });
      if (activeCount >= targetGroup.capacity) throw new ConflictException('The target group is at full capacity');

      const created = await tx.enrollment.create({
        data: {
          studentId: enrollment.studentId,
          groupId: dto.targetGroupId,
          startDate,
          agreedTuition,
          discountAmount,
          notes: dto.notes,
        },
      });
      return { oldEnrollmentId: id, newEnrollmentId: created.id };
    });

    // Response shape kept as the OLD enrollment's own fields (plus a nested
    // `transferredTo`) so AuditInterceptor's diff — keyed on the route's :id
    // — reads a clean "status: ACTIVE -> TRANSFERRED" rather than comparing
    // against an unrelated wrapper shape; diffFields() already skips nested
    // relation-shaped fields like transferredTo entirely (see diff-fields.util.ts).
    const oldEnrollment = await this.findOne(oldEnrollmentId);
    const newEnrollment = await this.findOne(newEnrollmentId);
    return { ...oldEnrollment, transferredTo: newEnrollment };
  }

  private async transitionTo(id: string, allowedFrom: EnrollmentStatus[], to: EnrollmentStatus) {
    const enrollment = await this.findOne(id);
    if (!allowedFrom.includes(enrollment.status)) {
      throw new ConflictException(`Cannot move an enrollment from ${enrollment.status} to ${to}`);
    }
    const result = await this.prisma.enrollment.updateMany({ where: { id, status: enrollment.status }, data: { status: to } });
    if (result.count === 0) throw new ConflictException('This enrollment was changed concurrently — please retry');
    return this.findOne(id);
  }

  private assertDatesValid(startDate: Date, endDateStr?: string): Date | undefined {
    if (Number.isNaN(startDate.getTime())) throw new BadRequestException('Invalid start date');
    if (!endDateStr) return undefined;
    const endDate = new Date(endDateStr);
    if (Number.isNaN(endDate.getTime())) throw new BadRequestException('Invalid end date');
    if (endDate < startDate) throw new BadRequestException('End date must not be before the start date');
    return endDate;
  }

  private assertTuitionValid(agreedTuition?: number, discountAmount?: number): void {
    if (discountAmount !== undefined && discountAmount > (agreedTuition ?? 0)) {
      throw new BadRequestException('Discount amount must not exceed the agreed tuition');
    }
  }
}
