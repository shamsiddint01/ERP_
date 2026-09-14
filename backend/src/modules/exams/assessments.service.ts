import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { GradingScaleService } from '../../shared/grading/grading-scale.service.js';
import type { CreateAssessmentDto } from './dto/create-assessment.dto.js';
import type { UpdateAssessmentDto } from './dto/update-assessment.dto.js';
import { assertTeacherScopeAllows } from './teacher-scope.util.js';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const ASSESSMENT_INCLUDE = {
  student: { select: { id: true, studentCode: true, fullName: true } },
  evaluatedBy: { select: { id: true, fullName: true } },
  exam: { select: { id: true, title: true, maxScore: true, passingScore: true, date: true, type: true, status: true } },
} satisfies Prisma.AssessmentInclude;

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gradingScale: GradingScaleService,
    registry: AuditEntityRegistryService,
  ) {
    registry.register('Assessment', (id) => this.prisma.assessment.findUnique({ where: { id } }));
  }

  async findAllForExam(examId: string, actorUserId: string) {
    const exam = await this.getExamOrThrow(examId);
    await assertTeacherScopeAllows(this.prisma, actorUserId, exam.group.teacherEmployeeId);
    return this.prisma.assessment.findMany({
      where: { examId },
      include: ASSESSMENT_INCLUDE,
      orderBy: { student: { fullName: 'asc' } },
    });
  }

  /**
   * "Student can be assessed only if enrolled in exam's group" + score
   * bounds + no duplicate (Exam, Student) — all three enforced here, the
   * latter backed by a genuine DB unique constraint (no override, unlike
   * Phase G's tuition-charge duplicate guard: the spec here is
   * unconditional).
   */
  async create(examId: string, dto: CreateAssessmentDto, actorUserId: string) {
    const exam = await this.getExamOrThrow(examId);
    if (exam.status === 'CANCELLED') throw new ConflictException('Cannot record an assessment for a cancelled exam');
    await assertTeacherScopeAllows(this.prisma, actorUserId, exam.group.teacherEmployeeId);
    await this.assertEnrolled(exam.groupId, dto.studentId, exam.date);

    const maxScore = Number(exam.maxScore);
    this.assertScoreInBounds(dto.score, maxScore);
    const percentage = round2((dto.score / maxScore) * 100);
    const grade = this.gradingScale.gradeFor(percentage);

    try {
      return await this.prisma.assessment.create({
        data: {
          examId,
          studentId: dto.studentId,
          score: dto.score,
          percentage,
          grade,
          comment: dto.comment,
          evaluatedByUserId: actorUserId,
          evaluatedAt: new Date(),
        },
        include: ASSESSMENT_INCLUDE,
      });
    } catch (error) {
      throw this.translateUniqueConstraintError(error);
    }
  }

  async update(id: string, dto: UpdateAssessmentDto, actorUserId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: { exam: { select: { maxScore: true, status: true, group: { select: { teacherEmployeeId: true } } } } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (assessment.exam.status === 'CANCELLED') throw new ConflictException('Cannot edit an assessment for a cancelled exam');
    await assertTeacherScopeAllows(this.prisma, actorUserId, assessment.exam.group.teacherEmployeeId);

    const maxScore = Number(assessment.exam.maxScore);
    let percentage: number | undefined;
    let grade: string | undefined;
    if (dto.score !== undefined) {
      this.assertScoreInBounds(dto.score, maxScore);
      percentage = round2((dto.score / maxScore) * 100);
      grade = this.gradingScale.gradeFor(percentage);
    }

    return this.prisma.assessment.update({
      where: { id },
      data: {
        score: dto.score,
        percentage,
        grade,
        comment: dto.comment,
        // A score correction is a re-evaluation — bump evaluatedBy/At the
        // same way StudentAttendance.update re-stamps markedAt/markedBy only
        // when the status genuinely changes.
        ...(dto.score !== undefined && { evaluatedByUserId: actorUserId, evaluatedAt: new Date() }),
      },
      include: ASSESSMENT_INCLUDE,
    });
  }

  /** Hard delete — a grade removal is a correction, same precedent as StudentAttendance.remove (Phase F): no workflow state here to preserve. */
  async remove(id: string, actorUserId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: { exam: { select: { group: { select: { teacherEmployeeId: true } } } } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    await assertTeacherScopeAllows(this.prisma, actorUserId, assessment.exam.group.teacherEmployeeId);
    await this.prisma.assessment.delete({ where: { id } });
    return { id };
  }

  private async getExamOrThrow(examId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId }, include: { group: { select: { teacherEmployeeId: true } } } });
    if (!exam) throw new NotFoundException('Exam not found');
    return exam;
  }

  private assertScoreInBounds(score: number, maxScore: number): void {
    if (score < 0 || score > maxScore) {
      throw new BadRequestException(`score must be between 0 and ${maxScore}`);
    }
  }

  /**
   * "enrolled in exam's group": an Enrollment for (studentId, groupId) whose
   * date range covers the exam's date and whose status isn't CANCELLED —
   * mirrors StudentAttendanceService.assertEligible (Phase F) exactly, with
   * the exam's own date standing in for a lesson's scheduledStart.
   */
  private async assertEnrolled(groupId: string, studentId: string, asOfDate: Date): Promise<void> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        groupId,
        status: { not: 'CANCELLED' },
        startDate: { lte: asOfDate },
        OR: [{ endDate: null }, { endDate: { gte: asOfDate } }],
      },
    });
    if (!enrollment) throw new BadRequestException("This student is not enrolled in the exam's group for this date");
  }

  private translateUniqueConstraintError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('This student already has an assessment recorded for this exam — edit it instead');
    }
    return error;
  }
}
