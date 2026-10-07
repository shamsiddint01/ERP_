import { describe, expect, it, vi } from 'vitest';
import { GroupsCleanupScheduler } from './groups-cleanup.scheduler.js';

function createPrisma(enrollments: { id: string; _count: { tuitionCharges: number } }[], expired = [{ id: 'g1' }]) {
  const deleteMany = () => vi.fn().mockResolvedValue({ count: 0 });
  const tx = {
    enrollment: { findMany: vi.fn().mockResolvedValue(enrollments), deleteMany: deleteMany() },
    studentAttendance: { deleteMany: deleteMany() },
    homeworkSubmission: { deleteMany: deleteMany() },
    homework: { deleteMany: deleteMany() },
    assessment: { deleteMany: deleteMany() },
    exam: { deleteMany: deleteMany() },
    lesson: { deleteMany: deleteMany() },
    schedule: { deleteMany: deleteMany() },
    studentDiscount: { deleteMany: deleteMany() },
    studentGroup: { delete: vi.fn(), update: vi.fn() },
  };
  return {
    studentGroup: { findMany: vi.fn().mockResolvedValue(expired) },
    $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    tx,
  };
}

describe('GroupsCleanupScheduler', () => {
  it('only picks groups cancelled at least 10 days ago and not already purged', async () => {
    const prisma = createPrisma([], []);
    await new GroupsCleanupScheduler(prisma as never).purgeExpired(new Date('2026-10-20T12:00:00Z'));
    expect(prisma.studentGroup.findMany).toHaveBeenCalledWith({
      where: { status: 'CANCELLED', deletedAt: null, cancelledAt: { lte: new Date('2026-10-10T12:00:00Z') } },
      select: { id: true },
    });
  });

  it('deletes a group with no money records outright, with everything that belongs to it', async () => {
    const prisma = createPrisma([{ id: 'e1', _count: { tuitionCharges: 0 } }]);
    expect(await new GroupsCleanupScheduler(prisma as never).purgeExpired()).toBe(1);
    expect(prisma.tx.lesson.deleteMany).toHaveBeenCalledWith({ where: { groupId: 'g1' } });
    expect(prisma.tx.homework.deleteMany).toHaveBeenCalledWith({ where: { groupId: 'g1' } });
    expect(prisma.tx.exam.deleteMany).toHaveBeenCalledWith({ where: { groupId: 'g1' } });
    expect(prisma.tx.enrollment.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['e1'] } } });
    expect(prisma.tx.studentGroup.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });

  it('keeps enrollments with tuition charges (money records) and only hides the group', async () => {
    const prisma = createPrisma([
      { id: 'e1', _count: { tuitionCharges: 2 } },
      { id: 'e2', _count: { tuitionCharges: 0 } },
    ]);
    await new GroupsCleanupScheduler(prisma as never).purgeExpired();
    expect(prisma.tx.enrollment.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['e2'] } } });
    expect(prisma.tx.studentGroup.delete).not.toHaveBeenCalled();
    expect(prisma.tx.studentGroup.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { deletedAt: expect.any(Date) } });
  });
});
