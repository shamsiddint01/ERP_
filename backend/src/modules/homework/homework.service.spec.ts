import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { HomeworkService } from './homework.service.js';

function createPrisma(opts: { teacherEmployeeId?: string | null; groupTeacher?: string | null } = {}) {
  const teacherEmployeeId = opts.teacherEmployeeId ?? null;
  const groupTeacher = 'groupTeacher' in opts ? opts.groupTeacher : 'emp-owner';
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ employeeId: teacherEmployeeId }) },
    teacherProfile: { findUnique: vi.fn().mockResolvedValue(teacherEmployeeId ? { status: 'ACTIVE' } : null) },
    studentGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'g1', teacherEmployeeId: groupTeacher, status: 'ACTIVE' }) },
    homework: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'hw1', ...data })),
      findUnique: vi.fn().mockResolvedValue({ id: 'hw1', groupId: 'g1', dueDate: new Date(), group: { teacherEmployeeId: groupTeacher } }),
      delete: vi.fn().mockResolvedValue({}),
    },
    homeworkSubmission: {
      findUnique: vi.fn().mockResolvedValue({ id: 'sub1', homework: { maxScore: 100, group: { teacherEmployeeId: groupTeacher } } }),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sub1', ...data })),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

const service = (prisma: ReturnType<typeof createPrisma>) => new HomeworkService(prisma as never, new AuditEntityRegistryService());
const dto = { groupId: 'g1', title: ' Essay ', dueDate: '2026-10-10T10:00:00.000Z' };

describe('HomeworkService', () => {
  it('lets a teacher assign homework to their own group, defaulting maxScore to 100', async () => {
    const prisma = createPrisma({ teacherEmployeeId: 'emp-owner' });
    await service(prisma).create(dto, 'teacher-user');
    expect(prisma.homework.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: 'Essay', maxScore: 100, createdByUserId: 'teacher-user' }) }));
  });

  it("refuses a teacher assigning homework to another teacher's group", async () => {
    const prisma = createPrisma({ teacherEmployeeId: 'emp-other' });
    await expect(service(prisma).create(dto, 'teacher-user')).rejects.toThrow(ForbiddenException);
  });

  it('lets non-teacher staff (RBAC-only) assign homework to any group', async () => {
    const prisma = createPrisma({ teacherEmployeeId: null });
    await expect(service(prisma).create(dto, 'manager-user')).resolves.toBeDefined();
  });

  it('marks a submission GRADED with who graded it', async () => {
    const prisma = createPrisma();
    await service(prisma).gradeSubmission('sub1', { score: 90, feedback: 'Zo\'r' }, 'manager-user');
    expect(prisma.homeworkSubmission.update).toHaveBeenCalledWith({
      where: { id: 'sub1' },
      data: expect.objectContaining({ score: 90, status: 'GRADED', gradedByUserId: 'manager-user' }),
    });
  });

  it('rejects a score above the homework maxScore', async () => {
    const prisma = createPrisma();
    await expect(service(prisma).gradeSubmission('sub1', { score: 101 }, 'manager-user')).rejects.toThrow(BadRequestException);
  });

  it('refuses to delete homework that already has graded submissions', async () => {
    const prisma = createPrisma();
    prisma.homeworkSubmission.count.mockResolvedValue(1);
    await expect(service(prisma).remove('hw1', 'manager-user')).rejects.toThrow(ConflictException);
    expect(prisma.homework.delete).not.toHaveBeenCalled();
  });
});
