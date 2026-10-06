import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import { resolveTeacherScope } from '../exams/teacher-scope.util.js';
import type { CreateHomeworkDto } from './dto/create-homework.dto.js';
import type { GradeSubmissionDto } from './dto/grade-submission.dto.js';
import type { QueryHomeworkDto } from './dto/query-homework.dto.js';
import type { UpdateHomeworkDto } from './dto/update-homework.dto.js';

/** Enrollments whose student is expected to do the group's homework. */
const ROSTER_STATUSES = ['ACTIVE', 'PAUSED'] as const;

const HOMEWORK_INCLUDE = {
  group: { select: { id: true, name: true, code: true, teacherEmployeeId: true } },
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { submissions: true } },
} satisfies Prisma.HomeworkInclude;

@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Homework', (id) => this.prisma.homework.findUnique({ where: { id } }));
    registry.register('HomeworkSubmission', (id) => this.prisma.homeworkSubmission.findUnique({ where: { id } }));
  }

  /** A teacher only ever sees homework of the groups they teach (silently narrowed, like every other teacher-scoped list). */
  async findAll(query: QueryHomeworkDto, actorUserId: string): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const teacherScope = await resolveTeacherScope(this.prisma, actorUserId);
    const where: Prisma.HomeworkWhereInput = {
      groupId: query.groupId,
      ...(teacherScope && { group: { teacherEmployeeId: teacherScope } }),
      ...(query.search && { title: { contains: query.search, mode: 'insensitive' } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.homework.findMany({
        where,
        include: { ...HOMEWORK_INCLUDE, submissions: { select: { status: true } } },
        orderBy: { dueDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.homework.count({ where }),
    ]);

    const rosterSizes = await this.rosterSizes(items.map((h) => h.groupId));
    return {
      items: items.map(({ submissions, ...h }) => ({
        ...h,
        rosterSize: rosterSizes.get(h.groupId) ?? 0,
        submittedCount: submissions.length,
        gradedCount: submissions.filter((s) => s.status === 'GRADED').length,
      })),
      total,
      page,
      pageSize,
    };
  }

  async create(dto: CreateHomeworkDto, actorUserId: string) {
    const group = await this.prisma.studentGroup.findUnique({ where: { id: dto.groupId }, select: { id: true, teacherEmployeeId: true, status: true } });
    if (!group) throw new NotFoundException('Group not found');
    if (group.status === 'CANCELLED' || group.status === 'COMPLETED') throw new ConflictException('Cannot assign homework to a cancelled or completed group');
    await this.assertOwnGroup(actorUserId, group.teacherEmployeeId);

    return this.prisma.homework.create({
      data: {
        groupId: dto.groupId,
        title: dto.title.trim(),
        description: dto.description,
        dueDate: new Date(dto.dueDate),
        maxScore: dto.maxScore ?? 100,
        createdByUserId: actorUserId,
      },
      include: HOMEWORK_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateHomeworkDto, actorUserId: string) {
    const homework = await this.getOwnedOrThrow(id, actorUserId);
    if (dto.maxScore !== undefined) {
      const highest = await this.prisma.homeworkSubmission.aggregate({ where: { homeworkId: id }, _max: { score: true } });
      if ((highest._max.score ?? 0) > dto.maxScore) {
        throw new ConflictException('maxScore cannot be lower than a score that has already been given');
      }
    }
    return this.prisma.homework.update({
      where: { id: homework.id },
      data: { title: dto.title?.trim(), description: dto.description, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, maxScore: dto.maxScore },
      include: HOMEWORK_INCLUDE,
    });
  }

  /** Deleting homework also deletes its submissions (cascade) — refused once anything has been graded, so a given grade is never silently lost. */
  async remove(id: string, actorUserId: string) {
    await this.getOwnedOrThrow(id, actorUserId);
    const graded = await this.prisma.homeworkSubmission.count({ where: { homeworkId: id, status: 'GRADED' } });
    if (graded > 0) throw new ConflictException('Cannot delete homework that already has graded submissions');
    await this.prisma.homework.delete({ where: { id } });
    return { id };
  }

  /** Every student on the group's roster, each with their submission (or null) — so a teacher also sees who has NOT submitted. */
  async findSubmissions(id: string, actorUserId: string) {
    const homework = await this.getOwnedOrThrow(id, actorUserId);
    const [enrollments, submissions] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { groupId: homework.groupId, status: { in: [...ROSTER_STATUSES] } },
        select: { student: { select: { id: true, fullName: true, studentCode: true } } },
        orderBy: { student: { fullName: 'asc' } },
      }),
      this.prisma.homeworkSubmission.findMany({ where: { homeworkId: id }, include: { gradedBy: { select: { id: true, fullName: true } } } }),
    ]);
    const byStudent = new Map(submissions.map((s) => [s.studentId, s]));
    const roster = new Map(enrollments.map((e) => [e.student.id, e.student]));
    // A student who submitted and later left the group still keeps their row.
    const departedIds = submissions.map((s) => s.studentId).filter((studentId) => !roster.has(studentId));
    if (departedIds.length > 0) {
      const departed = await this.prisma.student.findMany({ where: { id: { in: departedIds } }, select: { id: true, fullName: true, studentCode: true } });
      for (const student of departed) roster.set(student.id, student);
    }

    return {
      homework,
      items: [...roster.values()].map((student) => {
        const submission = byStudent.get(student.id) ?? null;
        return { student, submission, late: submission ? submission.submittedAt > homework.dueDate : false };
      }),
    };
  }

  async gradeSubmission(submissionId: string, dto: GradeSubmissionDto, actorUserId: string) {
    const submission = await this.prisma.homeworkSubmission.findUnique({
      where: { id: submissionId },
      include: { homework: { include: { group: { select: { teacherEmployeeId: true } } } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    await this.assertOwnGroup(actorUserId, submission.homework.group.teacherEmployeeId);
    if (dto.score > submission.homework.maxScore) {
      throw new BadRequestException(`Score cannot exceed the homework's max score (${submission.homework.maxScore})`);
    }
    return this.prisma.homeworkSubmission.update({
      where: { id: submissionId },
      data: { score: dto.score, feedback: dto.feedback, status: 'GRADED', gradedAt: new Date(), gradedByUserId: actorUserId },
    });
  }

  private async getOwnedOrThrow(id: string, actorUserId: string) {
    const homework = await this.prisma.homework.findUnique({ where: { id }, include: HOMEWORK_INCLUDE });
    if (!homework) throw new NotFoundException('Homework not found');
    await this.assertOwnGroup(actorUserId, homework.group.teacherEmployeeId);
    return homework;
  }

  /** Specific-record actions reject a teacher acting on another teacher's group outright. Non-teachers are governed by RBAC alone. */
  private async assertOwnGroup(actorUserId: string, groupTeacherEmployeeId: string | null) {
    const teacherScope = await resolveTeacherScope(this.prisma, actorUserId);
    if (teacherScope && teacherScope !== groupTeacherEmployeeId) {
      throw new ForbiddenException('You can only manage homework for groups you teach');
    }
  }

  private async rosterSizes(groupIds: string[]) {
    if (groupIds.length === 0) return new Map<string, number>();
    const rows = await this.prisma.enrollment.groupBy({
      by: ['groupId'],
      where: { groupId: { in: [...new Set(groupIds)] }, status: { in: [...ROSTER_STATUSES] } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.groupId, r._count._all]));
  }
}
