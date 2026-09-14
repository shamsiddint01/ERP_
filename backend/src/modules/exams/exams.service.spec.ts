import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { ExamsService } from './exams.service.js';

function fakeCourse(overrides: Record<string, unknown> = {}) {
  return { id: 'course1', name: 'IELTS', ...overrides };
}

function fakeGroup(overrides: Record<string, unknown> = {}) {
  return { id: 'group1', courseId: 'course1', name: 'IELTS Weekend', teacherEmployeeId: 'teacher1', ...overrides };
}

function fakeExam(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exam1',
    title: 'Midterm',
    status: 'SCHEDULED',
    maxScore: '100',
    passingScore: '60',
    group: { id: 'group1', name: 'IELTS Weekend', teacherEmployeeId: 'teacher1' },
    _count: { assessments: 0 },
    ...overrides,
  };
}

function createPrismaMock(opts: { course?: unknown; group?: unknown; exam?: unknown; user?: unknown; teacherProfile?: unknown; employee?: unknown } = {}) {
  const course = 'course' in opts ? opts.course : fakeCourse();
  const group = 'group' in opts ? opts.group : fakeGroup();
  const exam = 'exam' in opts ? opts.exam : fakeExam();
  const user = 'user' in opts ? opts.user : { employeeId: null };
  const teacherProfile = 'teacherProfile' in opts ? opts.teacherProfile : { status: 'ACTIVE' };
  const employee = 'employee' in opts ? opts.employee : { id: 'teacher1', deletedAt: null };

  return {
    course: { findUnique: vi.fn().mockResolvedValue(course) },
    studentGroup: { findUnique: vi.fn().mockResolvedValue(group) },
    exam: {
      findUnique: vi.fn().mockResolvedValue(exam),
      findMany: vi.fn().mockResolvedValue(exam ? [exam] : []),
      count: vi.fn().mockResolvedValue(exam ? 1 : 0),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-exam', _count: { assessments: 0 }, group: { name: 'IELTS Weekend' }, ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...(exam as object), ...data })),
      delete: vi.fn().mockResolvedValue({ id: 'exam1' }),
    },
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    teacherProfile: { findUnique: vi.fn().mockResolvedValue(teacherProfile) },
    employee: { findUnique: vi.fn().mockResolvedValue(employee) },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  const notifications = { notifyByPermission: vi.fn().mockResolvedValue(1) };
  const registry = new AuditEntityRegistryService();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new ExamsService(prisma as any, notifications as any, registry), notifications };
}

const baseDto = { title: 'Midterm', courseId: 'course1', groupId: 'group1', date: '2026-10-01T00:00:00.000Z', maxScore: 100, passingScore: 60, type: 'MIDTERM' as const };

describe('ExamsService.create', () => {
  it('creates an exam for a valid course+group pairing', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);
    const exam = await service.create(baseDto as never, 'admin1');
    expect(exam).toMatchObject({ title: 'Midterm', courseId: 'course1', groupId: 'group1' });
  });

  it('throws NotFoundException when the course does not exist', async () => {
    const prisma = createPrismaMock({ course: null });
    const { service } = createService(prisma);
    await expect(service.create(baseDto as never, 'admin1')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the group does not exist', async () => {
    const prisma = createPrismaMock({ group: null });
    const { service } = createService(prisma);
    await expect(service.create(baseDto as never, 'admin1')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the group does not belong to the given course', async () => {
    const prisma = createPrismaMock({ group: fakeGroup({ courseId: 'some-other-course' }) });
    const { service } = createService(prisma);
    await expect(service.create(baseDto as never, 'admin1')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when passingScore exceeds maxScore', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);
    await expect(service.create({ ...baseDto, maxScore: 50, passingScore: 60 } as never, 'admin1')).rejects.toThrow(BadRequestException);
  });

  it('rejects a scoped teacher creating an exam for a group they do not teach', async () => {
    const prisma = createPrismaMock({ user: { employeeId: 'someone-else' }, teacherProfile: { status: 'ACTIVE' } });
    const { service } = createService(prisma);
    await expect(service.create(baseDto as never, 'teacher-user-1')).rejects.toThrow(ForbiddenException);
  });

  it('allows a scoped teacher to create an exam for their own group, defaulting teacherEmployeeId to themselves', async () => {
    const prisma = createPrismaMock({ user: { employeeId: 'teacher1' }, teacherProfile: { status: 'ACTIVE' } });
    const { service } = createService(prisma);
    const exam = await service.create(baseDto as never, 'teacher-user-1');
    expect(exam).toMatchObject({ teacherEmployeeId: 'teacher1' });
  });

  it('rejects an inactive/non-existent explicit teacherEmployeeId', async () => {
    const prisma = createPrismaMock({ teacherProfile: null });
    const { service } = createService(prisma);
    await expect(service.create({ ...baseDto, teacherEmployeeId: 'someone' } as never, 'admin1')).rejects.toThrow(ConflictException);
  });
});

describe('ExamsService.findAll', () => {
  it('silently narrows a scoped teacher to only their own groups exams', async () => {
    const prisma = createPrismaMock({ user: { employeeId: 'teacher1' }, teacherProfile: { status: 'ACTIVE' } });
    const { service } = createService(prisma);
    await service.findAll({} as never, 'teacher-user-1');
    expect(prisma.exam.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ group: { teacherEmployeeId: 'teacher1' } }) }));
  });

  it('does not scope a non-teacher (e.g. Manager/Admin)', async () => {
    const prisma = createPrismaMock({ user: { employeeId: null } });
    const { service } = createService(prisma);
    await service.findAll({} as never, 'manager-user-1');
    const call = prisma.exam.findMany.mock.calls[0][0];
    expect(call.where.group).toBeUndefined();
  });
});

describe('ExamsService.update', () => {
  it('fires a GRADES_PUBLISHED notification exactly once when status transitions to COMPLETED with assessments recorded', async () => {
    const prisma = createPrismaMock({ exam: fakeExam({ status: 'SCHEDULED', _count: { assessments: 3 } }) });
    const { service, notifications } = createService(prisma);
    await service.update('exam1', { status: 'COMPLETED' } as never, 'admin1');
    expect(notifications.notifyByPermission).toHaveBeenCalledWith('grades', 'VIEW', expect.objectContaining({ type: 'GRADES_PUBLISHED' }));
  });

  it('does not fire GRADES_PUBLISHED when there are no assessments yet', async () => {
    const prisma = createPrismaMock({ exam: fakeExam({ status: 'SCHEDULED', _count: { assessments: 0 } }) });
    const { service, notifications } = createService(prisma);
    await service.update('exam1', { status: 'COMPLETED' } as never, 'admin1');
    expect(notifications.notifyByPermission).not.toHaveBeenCalled();
  });

  it('does not re-fire GRADES_PUBLISHED when the exam was already COMPLETED', async () => {
    const prisma = createPrismaMock({ exam: fakeExam({ status: 'COMPLETED', _count: { assessments: 3 } }) });
    const { service, notifications } = createService(prisma);
    await service.update('exam1', { notes: 'updated note' } as never, 'admin1');
    expect(notifications.notifyByPermission).not.toHaveBeenCalled();
  });

  it('rejects a scoped teacher editing an exam for a group they do not teach', async () => {
    const prisma = createPrismaMock({ exam: fakeExam({ group: { id: 'group1', name: 'X', teacherEmployeeId: 'someone-else' } }), user: { employeeId: 'teacher1' } });
    const { service } = createService(prisma);
    await expect(service.update('exam1', { notes: 'x' } as never, 'teacher-user-1')).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException for a missing exam', async () => {
    const prisma = createPrismaMock({ exam: null });
    const { service } = createService(prisma);
    await expect(service.update('missing', {} as never, 'admin1')).rejects.toThrow(NotFoundException);
  });
});

describe('ExamsService.remove', () => {
  it('refuses to delete an exam that already has assessments recorded', async () => {
    const prisma = createPrismaMock({ exam: fakeExam({ _count: { assessments: 2 } }) });
    const { service } = createService(prisma);
    await expect(service.remove('exam1', 'admin1')).rejects.toThrow(ConflictException);
  });

  it('deletes an exam with no assessments', async () => {
    const prisma = createPrismaMock({ exam: fakeExam({ _count: { assessments: 0 } }) });
    const { service } = createService(prisma);
    const result = await service.remove('exam1', 'admin1');
    expect(result).toEqual({ id: 'exam1' });
  });
});
