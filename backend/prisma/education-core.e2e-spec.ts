import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Phase A integration coverage — runs against the real dev database (part of
 * `pnpm test:e2e`, which already assumes Postgres/Redis are up). Every row is
 * created under the `ZZE2E-` code prefix and removed in afterAll, so it never
 * touches seed or production-like data.
 */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const P = 'ZZE2E-';

let branchId: string;
let classroomId: string;
let categoryId: string;
let courseId: string;
let groupId: string;
let studentId: string;
let guardianId: string;

beforeAll(async () => {
  const branch = await prisma.branch.create({ data: { code: `${P}BR`, name: 'E2E Branch' } });
  branchId = branch.id;
  const classroom = await prisma.classroom.create({ data: { branchId, name: 'E2E Room', roomNumber: 'E2E-1', capacity: 10 } });
  classroomId = classroom.id;
  const category = await prisma.courseCategory.create({ data: { code: `${P}CAT`, name: 'E2E Category' } });
  categoryId = category.id;
  const course = await prisma.course.create({ data: { code: `${P}CRS`, name: 'E2E Course', categoryId, defaultTuition: '500000.50', status: 'ACTIVE' } });
  courseId = course.id;
  const group = await prisma.studentGroup.create({
    data: { code: `${P}GRP`, name: 'E2E Group', courseId, branchId, classroomId, capacity: 8, startDate: new Date('2026-09-01'), status: 'ACTIVE' },
  });
  groupId = group.id;
  const student = await prisma.student.create({
    data: { studentCode: `${P}STU`, firstName: 'E2E', lastName: 'Student', fullName: 'E2E Student', branchId, status: 'ACTIVE' },
  });
  studentId = student.id;
  const guardian = await prisma.guardian.create({ data: { fullName: 'E2E Guardian', phone: '+998900000000', relationshipType: 'FATHER' } });
  guardianId = guardian.id;
});

afterAll(async () => {
  await prisma.enrollment.deleteMany({ where: { student: { studentCode: { startsWith: P } } } });
  await prisma.leadActivity.deleteMany({ where: { lead: { fullName: { startsWith: 'E2E ' } } } });
  await prisma.lead.deleteMany({ where: { fullName: { startsWith: 'E2E ' } } });
  await prisma.studentGuardian.deleteMany({ where: { student: { studentCode: { startsWith: P } } } });
  await prisma.guardian.deleteMany({ where: { fullName: { startsWith: 'E2E ' } } });
  await prisma.student.deleteMany({ where: { studentCode: { startsWith: P } } });
  await prisma.studentGroup.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.course.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.courseCategory.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.classroom.deleteMany({ where: { branch: { code: { startsWith: P } } } });
  await prisma.branch.deleteMany({ where: { code: { startsWith: P } } });
  await prisma.$disconnect();
});

describe('Education core domain (Phase A)', () => {
  it('a group resolves its course, branch and classroom relations', async () => {
    const g = await prisma.studentGroup.findUniqueOrThrow({ where: { id: groupId }, include: { course: true, branch: true, classroom: true } });
    expect(g.course.code).toBe(`${P}CRS`);
    expect(g.branch.code).toBe(`${P}BR`);
    expect(g.classroom?.roomNumber).toBe('E2E-1');
  });

  it('a course resolves its category', async () => {
    const c = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, include: { category: true } });
    expect(c.category?.name).toBe('E2E Category');
  });

  it('stores tuition as an exact Decimal (no float drift)', async () => {
    const c = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    expect(c.defaultTuition.toFixed(2)).toBe('500000.50');
  });

  it('links a student to a guardian many-to-many and back', async () => {
    await prisma.studentGuardian.create({ data: { studentId, guardianId, relationship: 'FATHER', isPrimary: true } });
    const s = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { guardians: { include: { guardian: true } } } });
    expect(s.guardians).toHaveLength(1);
    expect(s.guardians[0].guardian.fullName).toBe('E2E Guardian');
    const gu = await prisma.guardian.findUniqueOrThrow({ where: { id: guardianId }, include: { students: true } });
    expect(gu.students).toHaveLength(1);
  });

  it('rejects a duplicate student↔guardian pair (composite PK)', async () => {
    await expect(prisma.studentGuardian.create({ data: { studentId, guardianId } })).rejects.toThrow();
  });

  it('an enrollment connects a student and a group', async () => {
    const e = await prisma.enrollment.create({ data: { studentId, groupId, startDate: new Date('2026-09-01'), agreedTuition: '500000.00' } });
    expect(e.status).toBe('ACTIVE');
    const withRels = await prisma.enrollment.findUniqueOrThrow({ where: { id: e.id }, include: { student: true, group: true } });
    expect(withRels.student.studentCode).toBe(`${P}STU`);
    expect(withRels.group.code).toBe(`${P}GRP`);
  });

  it('allows the same student to re-enrol in the same group historically (no blocking unique constraint)', async () => {
    const e2 = await prisma.enrollment.create({ data: { studentId, groupId, startDate: new Date('2027-01-01'), status: 'COMPLETED' } });
    expect(e2.id).toBeTruthy();
    const count = await prisma.enrollment.count({ where: { studentId, groupId } });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('rejects a duplicate course code (unique constraint)', async () => {
    await expect(prisma.course.create({ data: { code: `${P}CRS`, name: 'dup' } })).rejects.toThrow();
  });

  it('rejects a duplicate room number within the same branch, but allows it in another branch', async () => {
    await expect(prisma.classroom.create({ data: { branchId, name: 'dup', roomNumber: 'E2E-1', capacity: 5 } })).rejects.toThrow();
    const other = await prisma.branch.create({ data: { code: `${P}BR2`, name: 'E2E Branch 2' } });
    const okRoom = await prisma.classroom.create({ data: { branchId: other.id, name: 'ok', roomNumber: 'E2E-1', capacity: 5 } });
    expect(okRoom.id).toBeTruthy();
  });

  it('a lead links to a preferred course and branch and carries activities', async () => {
    const lead = await prisma.lead.create({
      data: { fullName: 'E2E Lead', phone: '+998911111111', preferredCourseId: courseId, preferredBranchId: branchId, status: 'CONTACTED' },
    });
    await prisma.leadActivity.create({ data: { leadId: lead.id, type: 'CALL', description: 'intro call' } });
    const withRels = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      include: { preferredCourse: true, preferredBranch: true, activities: true },
    });
    expect(withRels.preferredCourse?.code).toBe(`${P}CRS`);
    expect(withRels.preferredBranch?.code).toBe(`${P}BR`);
    expect(withRels.activities).toHaveLength(1);
    expect(withRels.status).toBe('CONTACTED');
  });

  it('a lead is not automatically a student (no Phase A conversion)', async () => {
    const students = await prisma.student.count({ where: { fullName: 'E2E Lead' } });
    expect(students).toBe(0);
  });

  it('rejects a required-field violation (student without a code)', async () => {
    // @ts-expect-error deliberately omitting the required studentCode
    await expect(prisma.student.create({ data: { firstName: 'x', lastName: 'y', fullName: 'x y' } })).rejects.toThrow();
  });

  it('rejects an enrollment pointing at a non-existent group (FK)', async () => {
    await expect(
      prisma.enrollment.create({ data: { studentId, groupId: '00000000-0000-0000-0000-000000000000', startDate: new Date() } }),
    ).rejects.toThrow();
  });
});
