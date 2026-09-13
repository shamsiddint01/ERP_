import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditEntityRegistryService } from '../../shared/audit/audit-entity-registry.service.js';
import { DiscountsService } from './discounts.service.js';

function fakeDiscount(overrides: Record<string, unknown> = {}) {
  return { id: 'discount1', name: 'Sibling discount', type: 'PERCENTAGE', value: '10', isActive: true, ...overrides };
}

function createService(opts: { discount?: unknown; student?: unknown; enrollment?: unknown } = {}) {
  // NB: `??` treats an explicitly-passed `null` (simulating "not found") as
  // absent — use `in` so the not-found test paths actually exercise them.
  const discount = 'discount' in opts ? opts.discount : fakeDiscount();
  const student = 'student' in opts ? opts.student : { id: 'student1' };
  const enrollment = 'enrollment' in opts ? opts.enrollment : { id: 'enr1', studentId: 'student1' };
  const prisma = {
    discount: {
      findUnique: vi.fn().mockResolvedValue(discount),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-discount', ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...fakeDiscount(), ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    student: { findUnique: vi.fn().mockResolvedValue(student) },
    enrollment: { findUnique: vi.fn().mockResolvedValue(enrollment) },
    studentDiscount: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'grant1', ...data })),
      findUnique: vi.fn(),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'grant1', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const registry = new AuditEntityRegistryService();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new DiscountsService(prisma as any, registry), prisma };
}

describe('DiscountsService — catalog CRUD', () => {
  it('creates a PERCENTAGE discount at or below 100', async () => {
    const { service } = createService();
    const discount = await service.create({ name: 'Promo', type: 'PERCENTAGE', value: 15 } as never);
    expect(discount).toMatchObject({ name: 'Promo', type: 'PERCENTAGE', value: 15 });
  });

  it('rejects a PERCENTAGE discount above 100 on create', async () => {
    const { service } = createService();
    await expect(service.create({ name: 'Bad', type: 'PERCENTAGE', value: 150 } as never)).rejects.toThrow(BadRequestException);
  });

  it('allows a FIXED discount value above 100 (it is a flat currency amount, not a percentage)', async () => {
    const { service } = createService();
    const discount = await service.create({ name: 'Flat', type: 'FIXED', value: 500 } as never);
    expect(discount).toMatchObject({ value: 500 });
  });

  it('rejects raising an existing discount above 100 via update, using the effective (merged) type/value', async () => {
    const { service } = createService({ discount: fakeDiscount({ type: 'PERCENTAGE', value: '10' }) });
    await expect(service.update('discount1', { value: 200 } as never)).rejects.toThrow(BadRequestException);
  });

  it('allows switching an existing discount from PERCENTAGE to FIXED with a value above 100', async () => {
    const { service } = createService({ discount: fakeDiscount({ type: 'PERCENTAGE', value: '10' }) });
    const result = await service.update('discount1', { type: 'FIXED', value: 300 } as never);
    expect(result).toMatchObject({ value: 300 });
  });

  it('throws NotFoundException for a missing discount', async () => {
    const { service } = createService({ discount: null });
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('remove() soft-deactivates rather than hard-deleting', async () => {
    const { service, prisma } = createService();
    await service.remove('discount1');
    expect(prisma.discount.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
  });
});

describe('DiscountsService — student grants', () => {
  it('grants an active discount to a student with no enrollment scope', async () => {
    const { service } = createService();
    const grant = await service.grantToStudent('student1', { discountId: 'discount1', startDate: '2026-09-01' } as never);
    expect(grant).toMatchObject({ studentId: 'student1', discountId: 'discount1' });
  });

  it('refuses to grant an inactive discount', async () => {
    const { service } = createService({ discount: fakeDiscount({ isActive: false }) });
    await expect(service.grantToStudent('student1', { discountId: 'discount1', startDate: '2026-09-01' } as never)).rejects.toThrow(ConflictException);
  });

  it('refuses to scope a grant to an enrollment belonging to a different student', async () => {
    const { service } = createService({ enrollment: { id: 'enr1', studentId: 'someone-else' } });
    await expect(
      service.grantToStudent('student1', { discountId: 'discount1', enrollmentId: 'enr1', startDate: '2026-09-01' } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the scoped enrollment does not exist', async () => {
    const { service } = createService({ enrollment: null });
    await expect(
      service.grantToStudent('student1', { discountId: 'discount1', enrollmentId: 'missing', startDate: '2026-09-01' } as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an endDate before startDate', async () => {
    const { service } = createService();
    await expect(
      service.grantToStudent('student1', { discountId: 'discount1', startDate: '2026-09-30', endDate: '2026-09-01' } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the student does not exist', async () => {
    const { service } = createService({ student: null });
    await expect(service.grantToStudent('missing', { discountId: 'discount1', startDate: '2026-09-01' } as never)).rejects.toThrow(NotFoundException);
  });

  it('revokeGrant deactivates rather than deleting, and rejects a grant belonging to a different student', async () => {
    const { service, prisma } = createService();
    prisma.studentDiscount.findUnique = vi.fn().mockResolvedValue({ id: 'grant1', studentId: 'someone-else' });
    await expect(service.revokeGrant('student1', 'grant1')).rejects.toThrow(NotFoundException);
  });

  it('revokeGrant succeeds and deactivates a grant that does belong to the student', async () => {
    const { service, prisma } = createService();
    prisma.studentDiscount.findUnique = vi.fn().mockResolvedValue({ id: 'grant1', studentId: 'student1' });
    await service.revokeGrant('student1', 'grant1');
    expect(prisma.studentDiscount.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
  });
});
