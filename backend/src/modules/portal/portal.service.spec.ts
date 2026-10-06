import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PortalService } from './portal.service.js';

const STUDENT = { id: 'stu1', fullName: 'Aziz Karimov' };

function createPrisma(overrides: Record<string, Record<string, unknown>> = {}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    extraLesson: { findUnique: vi.fn() },
    extraLessonRegistration: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'reg1', ...data })) },
    ...overrides.tx,
  };
  const prisma = {
    student: { findUnique: vi.fn().mockResolvedValue(STUDENT), ...overrides.student },
    enrollment: { findMany: vi.fn().mockResolvedValue([{ groupId: 'g1' }]), ...overrides.enrollment },
    homework: { findUnique: vi.fn().mockResolvedValue({ id: 'hw1', groupId: 'g1' }), findMany: vi.fn().mockResolvedValue([]), ...overrides.homework },
    homeworkSubmission: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sub1', ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sub1', ...data })),
      ...overrides.homeworkSubmission,
    },
    extraLesson: { findUnique: vi.fn(), ...overrides.extraLesson },
    extraLessonRegistration: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }), ...overrides.extraLessonRegistration },
    $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)),
    __tx: tx,
  };
  return prisma;
}

function createService(prisma: ReturnType<typeof createPrisma>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PortalService(prisma as any, {} as any, {} as any, {} as any);
}

const future = () => new Date(Date.now() + 86_400_000);

describe('PortalService.resolveStudent', () => {
  it('refuses a user with no linked Student (staff, even an admin)', async () => {
    const prisma = createPrisma({ student: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(createService(prisma).resolveStudent('admin-user')).rejects.toThrow(ForbiddenException);
  });

  it('looks the student up by the caller\'s own user id only', async () => {
    const prisma = createPrisma();
    await createService(prisma).resolveStudent('user1');
    expect(prisma.student.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user1' } }));
  });
});

describe('PortalService.submitHomework', () => {
  it('creates the caller\'s submission for homework of their own group', async () => {
    const prisma = createPrisma();
    await createService(prisma).submitHomework('user1', 'hw1', { answerText: '  my answer  ' });
    expect(prisma.homeworkSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ homeworkId: 'hw1', studentId: 'stu1', answerText: 'my answer', link: null }),
    });
  });

  it('rejects homework of a group the student is not in', async () => {
    const prisma = createPrisma({ homework: { findUnique: vi.fn().mockResolvedValue({ id: 'hw1', groupId: 'other-group' }) } });
    await expect(createService(prisma).submitHomework('user1', 'hw1', { answerText: 'x' })).rejects.toThrow(ForbiddenException);
  });

  it('replaces an ungraded submission instead of creating a second one', async () => {
    const prisma = createPrisma({ homeworkSubmission: { findUnique: vi.fn().mockResolvedValue({ id: 'sub1', status: 'SUBMITTED' }) } });
    await createService(prisma).submitHomework('user1', 'hw1', { answerText: 'v2' });
    expect(prisma.homeworkSubmission.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sub1' } }));
    expect(prisma.homeworkSubmission.create).not.toHaveBeenCalled();
  });

  it('refuses to change a graded submission', async () => {
    const prisma = createPrisma({ homeworkSubmission: { findUnique: vi.fn().mockResolvedValue({ id: 'sub1', status: 'GRADED' }) } });
    await expect(createService(prisma).submitHomework('user1', 'hw1', { answerText: 'x' })).rejects.toThrow(ConflictException);
  });

  it('404s on unknown homework', async () => {
    const prisma = createPrisma({ homework: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(createService(prisma).submitHomework('user1', 'missing', { answerText: 'x' })).rejects.toThrow(NotFoundException);
  });
});

describe('PortalService.registerExtraLesson', () => {
  const lesson = (overrides: Record<string, unknown> = {}) => ({ id: 'el1', status: 'SCHEDULED', startsAt: future(), capacity: 2, _count: { registrations: 0 }, ...overrides });

  it('takes the per-lesson advisory lock and registers the student', async () => {
    const prisma = createPrisma();
    prisma.__tx.extraLesson.findUnique.mockResolvedValue(lesson());
    await createService(prisma).registerExtraLesson('user1', 'el1');
    expect(prisma.__tx.$executeRaw).toHaveBeenCalled();
    expect(prisma.__tx.extraLessonRegistration.create).toHaveBeenCalledWith({ data: { extraLessonId: 'el1', studentId: 'stu1' } });
  });

  it.each([
    ['full', lesson({ _count: { registrations: 2 } })],
    ['cancelled', lesson({ status: 'CANCELLED' })],
    ['already started', lesson({ startsAt: new Date(Date.now() - 1000) })],
  ])('refuses when the lesson is %s', async (_label, value) => {
    const prisma = createPrisma();
    prisma.__tx.extraLesson.findUnique.mockResolvedValue(value);
    await expect(createService(prisma).registerExtraLesson('user1', 'el1')).rejects.toThrow(ConflictException);
    expect(prisma.__tx.extraLessonRegistration.create).not.toHaveBeenCalled();
  });

  it('refuses a duplicate registration', async () => {
    const prisma = createPrisma();
    prisma.__tx.extraLesson.findUnique.mockResolvedValue(lesson());
    prisma.__tx.extraLessonRegistration.findUnique.mockResolvedValue({ id: 'reg1' });
    await expect(createService(prisma).registerExtraLesson('user1', 'el1')).rejects.toThrow(ConflictException);
  });
});

describe('PortalService.cancelExtraLessonRegistration', () => {
  it('only deletes the caller\'s own registration', async () => {
    const prisma = createPrisma({ extraLesson: { findUnique: vi.fn().mockResolvedValue({ startsAt: future() }) } });
    await createService(prisma).cancelExtraLessonRegistration('user1', 'el1');
    expect(prisma.extraLessonRegistration.deleteMany).toHaveBeenCalledWith({ where: { extraLessonId: 'el1', studentId: 'stu1' } });
  });

  it('refuses once the lesson has started', async () => {
    const prisma = createPrisma({ extraLesson: { findUnique: vi.fn().mockResolvedValue({ startsAt: new Date(Date.now() - 1000) }) } });
    await expect(createService(prisma).cancelExtraLessonRegistration('user1', 'el1')).rejects.toThrow(ConflictException);
  });
});
