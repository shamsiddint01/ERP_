import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateExamDto } from './dto/create-exam.dto.js';
import type { QueryExamDto } from './dto/query-exam.dto.js';
import type { UpdateExamDto } from './dto/update-exam.dto.js';
import { assertTeacherScopeAllows, resolveTeacherScope } from './teacher-scope.util.js';

const EXAM_INCLUDE = {
  course: { select: { id: true, name: true, code: true } },
  group: { select: { id: true, name: true, code: true, teacherEmployeeId: true, branch: { select: { id: true, name: true } } } },
  teacherEmployee: { select: { id: true, fullName: true } },
  _count: { select: { assessments: true } },
} satisfies Prisma.ExamInclude;

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Exam', (id) => this.prisma.exam.findUnique({ where: { id } }));
  }

  async findAll(query: QueryExamDto, actorUserId: string): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const teacherScope = await resolveTeacherScope(this.prisma, actorUserId);

    const where: Prisma.ExamWhereInput = {
      courseId: query.courseId,
      groupId: query.groupId,
      teacherEmployeeId: query.teacherEmployeeId,
      status: query.status,
      type: query.type,
      ...((query.dateFrom || query.dateTo) && {
        date: { gte: query.dateFrom ? new Date(query.dateFrom) : undefined, lte: query.dateTo ? new Date(query.dateTo) : undefined },
      }),
      // A teacher's own scope always wins — silently narrows to their own
      // groups' exams regardless of what was asked for ("Teacher: own
      // groups"), same rule StudentAttendanceService applies.
      ...(teacherScope && { group: { teacherEmployeeId: teacherScope } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.exam.findMany({ where, include: EXAM_INCLUDE, orderBy: { date: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.exam.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, actorUserId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id }, include: EXAM_INCLUDE });
    if (!exam) throw new NotFoundException('Exam not found');
    await assertTeacherScopeAllows(this.prisma, actorUserId, exam.group.teacherEmployeeId);
    return exam;
  }

  async create(dto: CreateExamDto, actorUserId: string) {
    const [course, group] = await Promise.all([
      this.prisma.course.findUnique({ where: { id: dto.courseId } }),
      this.prisma.studentGroup.findUnique({ where: { id: dto.groupId } }),
    ]);
    if (!course) throw new NotFoundException('Course not found');
    if (!group) throw new NotFoundException('Group not found');
    if (group.courseId !== dto.courseId) {
      throw new BadRequestException('The selected group does not belong to the selected course');
    }
    await assertTeacherScopeAllows(this.prisma, actorUserId, group.teacherEmployeeId);
    this.assertScoresConsistent(dto.maxScore, dto.passingScore);

    let teacherEmployeeId = dto.teacherEmployeeId ?? null;
    if (teacherEmployeeId) {
      await this.assertActiveTeacher(teacherEmployeeId);
    } else {
      // Convenience default: a teacher creating an exam for their own group
      // is naturally the exam's own teacher too, unless they say otherwise.
      const scope = await resolveTeacherScope(this.prisma, actorUserId);
      if (scope) teacherEmployeeId = scope;
    }

    return this.prisma.exam.create({
      data: {
        title: dto.title,
        courseId: dto.courseId,
        groupId: dto.groupId,
        teacherEmployeeId,
        date: new Date(dto.date),
        maxScore: dto.maxScore,
        passingScore: dto.passingScore,
        type: dto.type,
        notes: dto.notes,
      },
      include: EXAM_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateExamDto, actorUserId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id }, include: { group: { select: { teacherEmployeeId: true } } } });
    if (!exam) throw new NotFoundException('Exam not found');
    await assertTeacherScopeAllows(this.prisma, actorUserId, exam.group.teacherEmployeeId);

    const nextMaxScore = dto.maxScore ?? Number(exam.maxScore);
    const nextPassingScore = dto.passingScore ?? Number(exam.passingScore);
    this.assertScoresConsistent(nextMaxScore, nextPassingScore);
    if (dto.teacherEmployeeId) await this.assertActiveTeacher(dto.teacherEmployeeId);

    const wasCompleted = exam.status === 'COMPLETED';
    const updated = await this.prisma.exam.update({
      where: { id },
      data: {
        title: dto.title,
        teacherEmployeeId: dto.teacherEmployeeId,
        date: dto.date ? new Date(dto.date) : undefined,
        maxScore: dto.maxScore,
        passingScore: dto.passingScore,
        type: dto.type,
        status: dto.status,
        notes: dto.notes,
      },
      include: EXAM_INCLUDE,
    });

    // "Grades published" — one consolidated notification the moment an exam
    // is marked COMPLETED (never one per student; see AssessmentsService's
    // own doc comment on avoiding per-assessment spam).
    if (!wasCompleted && updated.status === 'COMPLETED' && updated._count.assessments > 0) {
      await this.notifications.notifyByPermission('grades', 'VIEW', {
        type: 'GRADES_PUBLISHED',
        title: "Baholar e'lon qilindi",
        message: `${updated.title} (${updated.group.name}) imtihoni yakunlandi — ${updated._count.assessments} ta baho qo'yildi.`,
        referenceType: 'Exam',
        referenceId: updated.id,
        actionUrl: `/exams/${updated.id}`,
      });
    }

    return updated;
  }

  /** Genuine hard delete, blocked once any Assessment exists — mirrors Discount's onDelete:Restrict precedent: an exam with real grades against it is never deleted, only its status can move to CANCELLED. */
  async remove(id: string, actorUserId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: { group: { select: { teacherEmployeeId: true } }, _count: { select: { assessments: true } } },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    await assertTeacherScopeAllows(this.prisma, actorUserId, exam.group.teacherEmployeeId);
    if (exam._count.assessments > 0) {
      throw new ConflictException('Cannot delete an exam that already has assessments recorded against it — cancel it instead');
    }
    await this.prisma.exam.delete({ where: { id } });
    return { id };
  }

  private assertScoresConsistent(maxScore: number, passingScore: number): void {
    if (passingScore > maxScore) {
      throw new BadRequestException('passingScore cannot exceed maxScore');
    }
  }

  /** Mirrors GroupsService.assertActiveTeacher (Phase D) at a lighter weight — no FOR UPDATE lock, since an Exam's teacher assignment isn't a concurrency-critical invariant the way a Group's ongoing one is. */
  private async assertActiveTeacher(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.deletedAt) throw new NotFoundException('Teacher employee not found');
    const profile = await this.prisma.teacherProfile.findUnique({ where: { employeeId } });
    if (!profile || profile.status !== 'ACTIVE') {
      throw new ConflictException('Selected employee is not an active teacher');
    }
  }
}
