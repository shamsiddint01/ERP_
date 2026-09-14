import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { AssessmentsService } from './assessments.service.js';

function fakeExam(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exam1',
    groupId: 'group1',
    date: new Date('2026-10-01'),
    maxScore: '100',
    status: 'SCHEDULED',
    group: { teacherEmployeeId: 'teacher1' },
    ...overrides,
  };
}

function fakeAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assessment1',
    examId: 'exam1',
    studentId: 'student1',
    score: '80',
    exam: { maxScore: '100', status: 'SCHEDULED', group: { teacherEmployeeId: 'teacher1' } },
    ...overrides,
  };
}

function createPrismaMock(opts: { exam?: unknown; assessment?: unknown; enrollment?: unknown; user?: unknown; teacherProfile?: unknown } = {}) {
  const exam = 'exam' in opts ? opts.exam : fakeExam();
  const assessment = 'assessment' in opts ? opts.assessment : fakeAssessment();
  const enrollment = 'enrollment' in opts ? opts.enrollment : { id: 'enrollment1' };
  const user = 'user' in opts ? opts.user : { employeeId: null };
  const teacherProfile = 'teacherProfile' in opts ? opts.teacherProfile : { status: 'ACTIVE' };

  return {
    exam: { findUnique: vi.fn().mockResolvedValue(exam) },
    enrollment: { findFirst: vi.fn().mockResolvedValue(enrollment) },
    assessment: {
      findMany: vi.fn().mockResolvedValue(assessment ? [assessment] : []),
      findUnique: vi.fn().mockResolvedValue(assessment),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-assessment', ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...(assessment as object), ...data })),
      delete: vi.fn().mockResolvedValue({ id: 'assessment1' }),
    },
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    teacherProfile: { findUnique: vi.fn().mockResolvedValue(teacherProfile) },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  const gradingScale = { gradeFor: vi.fn().mockImplementation((pct: number) => (pct >= 60 ? 'PASS-ish' : 'FAIL-ish')) };
  const registry = new AuditEntityRegistryService();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new AssessmentsService(prisma as any, gradingScale as any, registry), gradingScale };
}

describe('AssessmentsService.create', () => {
  it('creates an assessment, computing percentage and grade from score/maxScore', async () => {
    const prisma = createPrismaMock();
    const { service, gradingScale } = createService(prisma);
    const result = await service.create('exam1', { studentId: 'student1', score: 80 } as never, 'user1');
    expect(result).toMatchObject({ score: 80, percentage: 80 });
    expect(gradingScale.gradeFor).toHaveBeenCalledWith(80);
  });

  it('throws NotFoundException for a non-existent exam', async () => {
    const prisma = createPrismaMock({ exam: null });
    const { service } = createService(prisma);
    await expect(service.create('missing', { studentId: 'student1', score: 80 } as never, 'user1')).rejects.toThrow(NotFoundException);
  });

  it('refuses to record an assessment for a CANCELLED exam', async () => {
    const prisma = createPrismaMock({ exam: fakeExam({ status: 'CANCELLED' }) });
    const { service } = createService(prisma);
    await expect(service.create('exam1', { studentId: 'student1', score: 80 } as never, 'user1')).rejects.toThrow(ConflictException);
  });

  it('rejects a score above maxScore', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);
    await expect(service.create('exam1', { studentId: 'student1', score: 150 } as never, 'user1')).rejects.toThrow(BadRequestException);
  });

  it('rejects a negative score', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);
    await expect(service.create('exam1', { studentId: 'student1', score: -5 } as never, 'user1')).rejects.toThrow(BadRequestException);
  });

  it('accepts a score of exactly 0 and exactly maxScore', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);
    await expect(service.create('exam1', { studentId: 'student1', score: 0 } as never, 'user1')).resolves.toMatchObject({ score: 0 });
    await expect(service.create('exam1', { studentId: 'student2', score: 100 } as never, 'user1')).resolves.toMatchObject({ score: 100 });
  });

  it('rejects a student who is not enrolled in the exam\'s group', async () => {
    const prisma = createPrismaMock({ enrollment: null });
    const { service } = createService(prisma);
    await expect(service.create('exam1', { studentId: 'student1', score: 80 } as never, 'user1')).rejects.toThrow(BadRequestException);
  });

  it('rejects a scoped teacher grading a group they do not teach (foreign group)', async () => {
    const prisma = createPrismaMock({ exam: fakeExam({ group: { teacherEmployeeId: 'someone-else' } }), user: { employeeId: 'teacher1' } });
    const { service } = createService(prisma);
    await expect(service.create('exam1', { studentId: 'student1', score: 80 } as never, 'teacher-user-1')).rejects.toThrow(ForbiddenException);
  });

  it('allows a scoped teacher to grade their own group\'s exam', async () => {
    const prisma = createPrismaMock({ user: { employeeId: 'teacher1' } });
    const { service } = createService(prisma);
    await expect(service.create('exam1', { studentId: 'student1', score: 80 } as never, 'teacher-user-1')).resolves.toMatchObject({ score: 80 });
  });

  it('translates a unique constraint violation (duplicate exam+student) into ConflictException', async () => {
    const prisma = createPrismaMock();
    prisma.assessment.create = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    const { service } = createService(prisma);
    await expect(service.create('exam1', { studentId: 'student1', score: 80 } as never, 'user1')).rejects.toThrow(ConflictException);
  });
});

describe('AssessmentsService.update', () => {
  it('recomputes percentage/grade when score changes', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);
    const result = await service.update('assessment1', { score: 90 } as never, 'user1');
    expect(result).toMatchObject({ score: 90, percentage: 90 });
  });

  it('leaves percentage/grade untouched when only the comment changes', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);
    await service.update('assessment1', { comment: 'nice work' } as never, 'user1');
    const callArgs = prisma.assessment.update.mock.calls[0][0];
    expect(callArgs.data.percentage).toBeUndefined();
    expect(callArgs.data.grade).toBeUndefined();
  });

  it('rejects an out-of-bounds score on update', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);
    await expect(service.update('assessment1', { score: 999 } as never, 'user1')).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException for a missing assessment', async () => {
    const prisma = createPrismaMock({ assessment: null });
    const { service } = createService(prisma);
    await expect(service.update('missing', { score: 90 } as never, 'user1')).rejects.toThrow(NotFoundException);
  });

  it('rejects a scoped teacher editing an assessment for a group they do not teach', async () => {
    const prisma = createPrismaMock({
      assessment: fakeAssessment({ exam: { maxScore: '100', status: 'SCHEDULED', group: { teacherEmployeeId: 'someone-else' } } }),
      user: { employeeId: 'teacher1' },
    });
    const { service } = createService(prisma);
    await expect(service.update('assessment1', { score: 90 } as never, 'teacher-user-1')).rejects.toThrow(ForbiddenException);
  });
});

describe('AssessmentsService.remove', () => {
  it('deletes an assessment', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);
    const result = await service.remove('assessment1', 'user1');
    expect(result).toEqual({ id: 'assessment1' });
  });

  it('throws NotFoundException for a missing assessment', async () => {
    const prisma = createPrismaMock({ assessment: null });
    const { service } = createService(prisma);
    await expect(service.remove('missing', 'user1')).rejects.toThrow(NotFoundException);
  });
});
