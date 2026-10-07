import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, PermissionAction, type Prisma, type ScheduleDayOfWeek } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Redis } from 'ioredis';
import { PERMISSION_MODULES } from '../src/shared/constants/permission-modules.constant.js';
import { gradeForPercentage } from '../src/shared/grading/grading-scale.js';
import { encryptCredential } from '../src/shared/security/credential-cipher.js';
import { generateDocumentNumber } from '../src/shared/utils/document-number.util.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

/**
 * Starter role → permission matrix. Admin always gets everything (computed
 * below from PERMISSION_MODULES, not listed by hand, so it can never drift
 * out of sync as new modules are added). The rest are reasonable defaults
 * that an admin is expected to fine-tune via the Roles & Permissions UI.
 */
const ROLE_DEFINITIONS: Array<{
  name: string;
  description: string;
  grants: Partial<Record<keyof typeof PERMISSION_MODULES, PermissionAction[]>>;
}> = [
  {
    name: 'Manager',
    description: "Runs the center day to day: students, teachers, groups, attendance, tests and reports.",
    grants: {
      students: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      teachers: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      groups: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      enrollments: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      courses: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      branches: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      classrooms: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      schedules: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
      lessons: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
      student_attendance: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      exams: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      grades: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
      // Can see billing and step in to cancel a charge, but billing itself and
      // the Discount catalog stay with the Accountant.
      tuition: [PermissionAction.VIEW, PermissionAction.APPROVE, PermissionAction.EXPORT],
      discounts: [PermissionAction.VIEW],
      payments: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EXPORT],
      reports: [PermissionAction.VIEW, PermissionAction.EXPORT],
      notifications: [PermissionAction.VIEW],
      homework: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
      extra_lessons: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
      salaries: [PermissionAction.VIEW],
    },
  },
  {
    name: 'Accountant',
    description: "Owns tuition billing, payments and discounts.",
    grants: {
      tuition: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
      discounts: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
      payments: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
      reports: [PermissionAction.VIEW, PermissionAction.EXPORT],
      notifications: [PermissionAction.VIEW],
      salaries: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.DELETE],
      // Read-only academic context — never edits grades.
      students: [PermissionAction.VIEW],
      groups: [PermissionAction.VIEW],
      student_attendance: [PermissionAction.VIEW],
      exams: [PermissionAction.VIEW],
      grades: [PermissionAction.VIEW],
    },
  },
  // A teacher's *actual* scope (their own groups/lessons only) is enforced in
  // the services via their TeacherProfile linkage, not by this role name —
  // these are just the module-level grants to reach the pages at all.
  {
    name: 'Teacher',
    description: "Teaches their own groups: lessons, attendance and tests.",
    grants: {
      groups: [PermissionAction.VIEW],
      schedules: [PermissionAction.VIEW],
      lessons: [PermissionAction.VIEW, PermissionAction.EDIT],
      students: [PermissionAction.VIEW],
      // enrollments:VIEW builds the lesson attendance roster.
      enrollments: [PermissionAction.VIEW],
      student_attendance: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
      exams: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
      grades: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
      // Own groups only — enforced per record in HomeworkService.
      homework: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
      extra_lessons: [PermissionAction.VIEW],
      notifications: [PermissionAction.VIEW],
      // The teacher cabinet's own-salary page.
      teacher_portal: [PermissionAction.VIEW],
    },
  },
  {
    name: 'Receptionist',
    description: "Front desk: registers students, enrolls them into groups and takes payments.",
    grants: {
      students: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
      enrollments: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
      groups: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
      courses: [PermissionAction.VIEW],
      branches: [PermissionAction.VIEW],
      classrooms: [PermissionAction.VIEW],
      teachers: [PermissionAction.VIEW],
      schedules: [PermissionAction.VIEW],
      lessons: [PermissionAction.VIEW],
      student_attendance: [PermissionAction.VIEW],
      // Can take a payment and assign it to the right charge, but never bills a new charge.
      tuition: [PermissionAction.VIEW, PermissionAction.EDIT],
      payments: [PermissionAction.VIEW, PermissionAction.CREATE],
      exams: [PermissionAction.VIEW],
      homework: [PermissionAction.VIEW],
      extra_lessons: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
      notifications: [PermissionAction.VIEW],
    },
  },
  // A student's portal login. student_portal alone opens /portal/*, which
  // additionally only ever returns the caller's own linked Student record.
  {
    name: 'Student',
    description: "O'quvchi: faqat o'z portali (uy ishi, guruhlar, to'lovlar, imtihonlar, ko'rsatkichlar, qo'shimcha darslar).",
    grants: {
      student_portal: [PermissionAction.VIEW],
    },
  },
];

/** Starter roles from the old retail ERP — removed when nobody is assigned to them any more. */
const OBSOLETE_ROLE_NAMES = ['Sales Rep', 'Warehouse Staff'];

async function main() {
  console.log('Seeding permissions...');
  const permissionRows = Object.entries(PERMISSION_MODULES).flatMap(([module, actions]) =>
    actions.map((action) => ({ module, action })),
  );
  await prisma.$transaction(
    permissionRows.map((row) =>
      prisma.permission.upsert({
        where: { module_action: { module: row.module, action: row.action } },
        create: row,
        update: {},
      }),
    ),
  );
  const allPermissions = await prisma.permission.findMany();
  console.log(`  -> ${allPermissions.length} permissions ensured`);

  console.log('Seeding Admin role (all permissions)...');
  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    create: { name: 'Admin', description: 'Full system access.', isSystemRole: true },
    update: {},
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((permission) => ({ roleId: adminRole.id, permissionId: permission.id })),
    skipDuplicates: true,
  });

  // Phase K — "Do not unnecessarily delete existing roles. Safely map or
  // migrate existing role assignments": the final role name is
  // "Receptionist", but every earlier phase seeded it as "Reception". A
  // rename-in-place (not a fresh upsert under the new name) is what makes
  // this safe — it keeps the SAME role id, so every User already assigned
  // to it, and the row itself, transparently carries over; upserting under
  // the new name instead would silently orphan the old "Reception" row and
  // anyone still assigned to it. Idempotent: a second run matches zero rows
  // and does nothing.
  await prisma.role.updateMany({ where: { name: 'Reception' }, data: { name: 'Receptionist' } });

  for (const roleDef of ROLE_DEFINITIONS) {
    console.log(`Seeding role: ${roleDef.name}...`);
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      create: { name: roleDef.name, description: roleDef.description, isSystemRole: true },
      update: { description: roleDef.description },
    });

    const grantedPairs = Object.entries(roleDef.grants).flatMap(([module, actions]) =>
      (actions ?? []).map((action) => ({ module, action })),
    );
    const permissions = await prisma.permission.findMany({ where: { OR: grantedPairs } });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }

  for (const name of OBSOLETE_ROLE_NAMES) {
    const removed = await prisma.role.deleteMany({ where: { name, users: { none: {} } } });
    if (removed.count > 0) console.log(`Removed obsolete role: ${name}`);
  }

  console.log('Seeding default admin user...');
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    create: {
      fullName: 'System Administrator',
      email: 'admin@erp.local',
      username: 'admin',
      passwordHash,
      temporaryPassword: encryptCredential(adminPassword),
      roleId: adminRole.id,
      status: 'ACTIVE',
    },
    update: {},
  });
  console.log(`  -> admin / ${adminPassword} (change this immediately after first login)`);

  console.log('Seeding default company settings...');
  const existingSettings = await prisma.companySettings.findFirst();
  if (!existingSettings) {
    await prisma.companySettings.create({
      data: {
        companyName: 'My Company',
        currency: 'UZS',
        timezone: 'Asia/Tashkent',
        defaultLanguage: 'uz',
      },
    });
  }

  console.log('Seeding Education Center demo data (Phase A)...');
  await seedEducationCoreDemo();

  console.log('Seeding a demo Teacher login (Phase F)...');
  await seedDemoTeacherUser();

  console.log('Seeding demo Manager/Accountant/Reception logins (Phase J)...');
  await seedDemoRoleUsers();

  console.log('Seeding tuition billing/payments/discounts demo data (Phase G)...');
  await seedTuitionBillingDemo();

  console.log('Seeding exams/grades demo data (Phase H)...');
  await seedExamsGradesDemo();

  console.log('Seeding student portal demo data (login, homework, extra lessons)...');
  await seedStudentPortalDemo();

  console.log('Invalidating cached role-permissions (RolePermissionsCacheService)...');
  await flushRolePermissionsCache();

  console.log('Seed complete.');
}

/**
 * Minimal, idempotent demo data for the education-center core domain — enough
 * to exercise every Phase A relation. All records are keyed by their unique
 * `code` and upserted, so re-running the seed never duplicates and never
 * touches unrelated rows. Clearly fake data.
 */
async function seedEducationCoreDemo(): Promise<void> {
  const branch = await prisma.branch.upsert({
    where: { code: 'BR-MAIN' },
    create: { code: 'BR-MAIN', name: 'Main Branch', address: 'Tashkent, Amir Temur ko\'chasi 1', phone: '+998710000001', workingHours: 'Mon-Sat 08:00-21:00' },
    update: {},
  });

  const rooms = [
    { code: '101', name: 'Room 101', capacity: 14 },
    { code: '204', name: 'Room 204', capacity: 12 },
  ];
  for (const r of rooms) {
    await prisma.classroom.upsert({
      where: { branchId_roomNumber: { branchId: branch.id, roomNumber: r.code } },
      create: { branchId: branch.id, roomNumber: r.code, name: r.name, capacity: r.capacity },
      update: {},
    });
  }
  const room101 = await prisma.classroom.findUniqueOrThrow({ where: { branchId_roomNumber: { branchId: branch.id, roomNumber: '101' } } });

  // Phase C — a second branch, with its own classrooms, so multi-branch
  // selection has real data to exercise beyond the single Phase A branch.
  const chilonzor = await prisma.branch.upsert({
    where: { code: 'BR-CHIL' },
    create: {
      code: 'BR-CHIL',
      name: 'Chilonzor Branch',
      address: "Tashkent, Chilonzor tumani, Bunyodkor shoh ko'chasi 12",
      phone: '+998710000002',
      workingHours: 'Mon-Sat 09:00-20:00',
    },
    update: {},
  });
  const moreRooms = [
    { branchId: branch.id, code: '102', name: 'Room 102', capacity: 10 },
    { branchId: chilonzor.id, code: '201', name: 'Room 201', capacity: 16 },
    { branchId: chilonzor.id, code: '202', name: 'Room 202', capacity: 8 },
  ];
  for (const r of moreRooms) {
    await prisma.classroom.upsert({
      where: { branchId_roomNumber: { branchId: r.branchId, roomNumber: r.code } },
      create: { branchId: r.branchId, roomNumber: r.code, name: r.name, capacity: r.capacity },
      update: {},
    });
  }
  const room102 = await prisma.classroom.findUniqueOrThrow({ where: { branchId_roomNumber: { branchId: branch.id, roomNumber: '102' } } });
  const room201 = await prisma.classroom.findUniqueOrThrow({ where: { branchId_roomNumber: { branchId: chilonzor.id, roomNumber: '201' } } });
  const room202 = await prisma.classroom.findUniqueOrThrow({ where: { branchId_roomNumber: { branchId: chilonzor.id, roomNumber: '202' } } });

  // Phase D — teaching staff. These are brand-new Employee rows (none of the
  // three pre-existing employees in this database came from this seed, so
  // they're left untouched); keyed by employeeCode so re-running never
  // duplicates them.
  const teacherEmployeeDefs = [
    { code: 'EMP-TCH-001', firstName: 'Sarvinoz', lastName: 'Tashkentova', phone: '+998901112240', hireDate: '2023-01-15' },
    { code: 'EMP-TCH-002', firstName: 'Jahongir', lastName: 'Rustamov', phone: '+998901112241', hireDate: '2024-03-01' },
    { code: 'EMP-TCH-003', firstName: 'Kamila', lastName: 'Nazarova', phone: '+998901112242', hireDate: '2022-09-01' },
  ];
  const teacherEmployeesByCode: Record<string, { id: string }> = {};
  for (const t of teacherEmployeeDefs) {
    teacherEmployeesByCode[t.code] = await prisma.employee.upsert({
      where: { employeeCode: t.code },
      create: {
        employeeCode: t.code,
        firstName: t.firstName,
        lastName: t.lastName,
        fullName: `${t.firstName} ${t.lastName}`,
        phone: t.phone,
        hireDate: new Date(t.hireDate),
        status: 'ACTIVE',
      },
      update: {},
    });
  }

  const teacherProfileDefs = [
    { employeeCode: 'EMP-TCH-001', specialization: 'IELTS, General English', qualification: 'CELTA certified', experienceYears: 5, hourlyRate: '80000', perLessonRate: '120000', perGroupRate: '1500000' },
    { employeeCode: 'EMP-TCH-002', specialization: 'Python, Backend Development', qualification: 'BSc Computer Science', experienceYears: 3, hourlyRate: '90000', perLessonRate: '140000', perGroupRate: '1800000' },
    { employeeCode: 'EMP-TCH-003', specialization: 'Mathematics', qualification: 'MSc Mathematics', experienceYears: 7, hourlyRate: '75000', perLessonRate: '110000', perGroupRate: '1400000' },
  ];
  for (const tp of teacherProfileDefs) {
    const employeeId = teacherEmployeesByCode[tp.employeeCode].id;
    await prisma.teacherProfile.upsert({
      where: { employeeId },
      create: {
        employeeId,
        specialization: tp.specialization,
        qualification: tp.qualification,
        experienceYears: tp.experienceYears,
        hourlyRate: tp.hourlyRate,
        perLessonRate: tp.perLessonRate,
        perGroupRate: tp.perGroupRate,
        status: 'ACTIVE',
      },
      update: {},
    });
  }

  const languages = await prisma.courseCategory.upsert({
    where: { code: 'CAT-LANG' },
    create: { code: 'CAT-LANG', name: 'Languages', description: 'Foreign language programs' },
    update: {},
  });
  const stem = await prisma.courseCategory.upsert({
    where: { code: 'CAT-STEM' },
    create: { code: 'CAT-STEM', name: 'Programming & Maths', description: 'STEM courses' },
    update: {},
  });
  const academic = await prisma.courseCategory.upsert({
    where: { code: 'CAT-ACAD' },
    create: { code: 'CAT-ACAD', name: 'Academic', description: 'School-support academic subjects' },
    update: {},
  });

  const courseDefs = [
    { code: 'ENG-GEN', name: 'General English', categoryId: languages.id, level: 'ELEMENTARY' as const, defaultTuition: '600000', durationWeeks: 12 },
    { code: 'IELTS', name: 'IELTS Preparation', categoryId: languages.id, level: 'UPPER_INTERMEDIATE' as const, defaultTuition: '900000', durationWeeks: 10 },
    { code: 'PY-BASE', name: 'Python Basics', categoryId: stem.id, level: 'BEGINNER' as const, defaultTuition: '750000', durationWeeks: 16 },
    // Phase C additions — genuinely new offerings, not duplicates of the above.
    { code: 'PY-BACK', name: 'Python Backend', categoryId: stem.id, level: 'INTERMEDIATE' as const, defaultTuition: '1100000', durationWeeks: 20 },
    { code: 'MATH-01', name: 'Mathematics', categoryId: academic.id, level: 'INTERMEDIATE' as const, defaultTuition: '500000', durationWeeks: 24 },
    { code: 'JPN-01', name: 'Japanese', categoryId: languages.id, level: 'BEGINNER' as const, defaultTuition: '650000', durationWeeks: 20 },
  ];
  const coursesByCode: Record<string, { id: string }> = {};
  for (const c of courseDefs) {
    coursesByCode[c.code] = await prisma.course.upsert({
      where: { code: c.code },
      create: { code: c.code, name: c.name, categoryId: c.categoryId, level: c.level, defaultTuition: c.defaultTuition, durationWeeks: c.durationWeeks, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
  }

  const groupDefs = [
    { code: 'ENG-A1-01', name: 'English A1 — Evening', courseCode: 'ENG-GEN', level: 'ELEMENTARY' as const, tuition: '600000', start: '2026-09-01', branchId: branch.id, classroomId: room101.id, capacity: 12, teacherEmployeeId: undefined as string | undefined },
    { code: 'IELTS-01', name: 'IELTS Intensive', courseCode: 'IELTS', level: 'UPPER_INTERMEDIATE' as const, tuition: '900000', start: '2026-09-15', branchId: branch.id, classroomId: room101.id, capacity: 12, teacherEmployeeId: undefined as string | undefined },
    // Phase D additions — multiple branches/classrooms, each with a real teacher assigned.
    {
      code: 'IELTS-02',
      name: 'IELTS Weekend',
      courseCode: 'IELTS',
      level: 'UPPER_INTERMEDIATE' as const,
      tuition: '900000',
      start: '2026-09-01',
      branchId: chilonzor.id,
      classroomId: room201.id,
      capacity: 10,
      teacherEmployeeId: teacherEmployeesByCode['EMP-TCH-001'].id as string | undefined,
    },
    {
      code: 'PY-BACK-01',
      name: 'Python Backend — Batch 1',
      courseCode: 'PY-BACK',
      level: 'INTERMEDIATE' as const,
      tuition: '1100000',
      start: '2026-09-10',
      branchId: branch.id,
      classroomId: room102.id,
      capacity: 8,
      teacherEmployeeId: teacherEmployeesByCode['EMP-TCH-002'].id as string | undefined,
    },
    {
      code: 'MATH-01-EVE',
      name: 'Mathematics — Evening',
      courseCode: 'MATH-01',
      level: 'INTERMEDIATE' as const,
      tuition: '500000',
      start: '2026-08-01',
      branchId: chilonzor.id,
      classroomId: room202.id,
      capacity: 15,
      teacherEmployeeId: teacherEmployeesByCode['EMP-TCH-003'].id as string | undefined,
    },
  ];
  const groupsByCode: Record<string, { id: string }> = {};
  for (const g of groupDefs) {
    groupsByCode[g.code] = await prisma.studentGroup.upsert({
      where: { code: g.code },
      create: {
        code: g.code,
        name: g.name,
        courseId: coursesByCode[g.courseCode].id,
        branchId: g.branchId,
        classroomId: g.classroomId,
        teacherEmployeeId: g.teacherEmployeeId,
        capacity: g.capacity,
        tuitionAmount: g.tuition,
        level: g.level,
        startDate: new Date(g.start),
        status: 'ACTIVE',
      },
      update: {},
    });
  }

  const studentDefs = [
    { code: 'STU-000001', firstName: 'Aziz', lastName: 'Karimov', phone: '+998901112233' },
    { code: 'STU-000002', firstName: 'Malika', lastName: 'Yusupova', phone: '+998901112234' },
    { code: 'STU-000003', firstName: 'Sardor', lastName: 'Aliyev', phone: '+998901112235' },
    { code: 'STU-000004', firstName: 'Nilufar', lastName: 'Xolmatova', phone: '+998901112236' },
    { code: 'STU-000005', firstName: 'Otabek', lastName: 'Ergashev', phone: '+998901112237' },
    // Phase D additions — enough distinct students to populate the new groups.
    { code: 'STU-000006', firstName: 'Sevara', lastName: 'Nodirova', phone: '+998901112238' },
    { code: 'STU-000007', firstName: 'Bekzod', lastName: 'Islomov', phone: '+998901112239' },
    { code: 'STU-000008', firstName: 'Madina', lastName: 'Tursunova', phone: '+998901112243' },
  ];
  const studentsByCode: Record<string, { id: string }> = {};
  for (const s of studentDefs) {
    studentsByCode[s.code] = await prisma.student.upsert({
      where: { studentCode: s.code },
      create: {
        studentCode: s.code,
        firstName: s.firstName,
        lastName: s.lastName,
        fullName: `${s.firstName} ${s.lastName}`,
        phone: s.phone,
        branchId: branch.id,
        source: 'SEED',
        status: 'ACTIVE',
      },
      update: {},
    });
  }

  // Enrollments — key on (studentId, groupId, status) via findFirst; a
  // student may historically re-enrol (or hold a TRANSFERRED/COMPLETED row
  // alongside a current ACTIVE one in a different group), so there's no
  // blocking unique constraint, just an idempotent dedupe here.
  const enrollmentDefs = [
    { studentCode: 'STU-000001', groupCode: 'ENG-A1-01', tuition: '600000', status: 'ACTIVE' as const, start: '2026-09-01' },
    { studentCode: 'STU-000002', groupCode: 'IELTS-01', tuition: '900000', status: 'ACTIVE' as const, start: '2026-09-15' },
    // Phase D additions — distributed across the new groups, with a genuine
    // transfer (STU-000003: ENG-A1-01 -> IELTS-02) and a completed enrollment
    // as the required historical examples.
    { studentCode: 'STU-000003', groupCode: 'ENG-A1-01', tuition: '600000', status: 'TRANSFERRED' as const, start: '2026-09-01' },
    { studentCode: 'STU-000003', groupCode: 'IELTS-02', tuition: '900000', status: 'ACTIVE' as const, start: '2026-09-05' },
    { studentCode: 'STU-000004', groupCode: 'PY-BACK-01', tuition: '1100000', status: 'ACTIVE' as const, start: '2026-09-10' },
    { studentCode: 'STU-000005', groupCode: 'PY-BACK-01', tuition: '1100000', status: 'PAUSED' as const, start: '2026-09-10' },
    { studentCode: 'STU-000006', groupCode: 'MATH-01-EVE', tuition: '500000', status: 'COMPLETED' as const, start: '2026-08-01' },
    { studentCode: 'STU-000007', groupCode: 'MATH-01-EVE', tuition: '500000', status: 'ACTIVE' as const, start: '2026-08-01' },
    { studentCode: 'STU-000008', groupCode: 'IELTS-02', tuition: '900000', status: 'ACTIVE' as const, start: '2026-09-05' },
  ];
  for (const e of enrollmentDefs) {
    const studentId = studentsByCode[e.studentCode].id;
    const groupId = groupsByCode[e.groupCode].id;
    const existing = await prisma.enrollment.findFirst({ where: { studentId, groupId, status: e.status } });
    if (!existing) {
      await prisma.enrollment.create({
        data: { studentId, groupId, startDate: new Date(e.start), status: e.status, agreedTuition: e.tuition },
      });
    }
  }

  // Phase E — Schedules + Lessons. One weekly Schedule row per (group, day),
  // covering both branches, all three teachers and a teacher-less group, plus
  // a handful of generated Lesson rows per schedule so the workflow actions
  // (start/complete/cancel) all have real historical examples to
  // demonstrate, not just SCHEDULED rows. Kept independent of
  // LessonGenerationService by design — every other block in this seed
  // inserts trusted rows directly via Prisma rather than going through
  // service-layer business rules, and this follows the same convention.
  const DAY_INDEX: Record<ScheduleDayOfWeek, number> = {
    SUNDAY: 0,
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
  };
  function lessonDatesFor(startDate: Date, dayOfWeek: ScheduleDayOfWeek, count: number): Date[] {
    const target = DAY_INDEX[dayOfWeek];
    const cursor = new Date(startDate);
    while (cursor.getUTCDay() !== target) cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dates: Date[] = [];
    for (let i = 0; i < count; i++) {
      dates.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return dates;
  }
  function atTime(date: Date, time: string): Date {
    const [h, m] = time.split(':').map(Number);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m, 0, 0));
  }

  const scheduleDefs: Array<{
    groupCode: string;
    classroomId: string;
    branchId: string;
    teacherEmployeeId?: string;
    days: ScheduleDayOfWeek[];
    start: string;
    end: string;
  }> = [
    { groupCode: 'ENG-A1-01', classroomId: room101.id, branchId: branch.id, days: ['MONDAY', 'WEDNESDAY', 'FRIDAY'], start: '18:00', end: '19:30' },
    {
      groupCode: 'IELTS-02',
      classroomId: room201.id,
      branchId: chilonzor.id,
      teacherEmployeeId: teacherEmployeesByCode['EMP-TCH-001'].id,
      days: ['TUESDAY', 'THURSDAY'],
      start: '17:00',
      end: '18:30',
    },
    {
      groupCode: 'PY-BACK-01',
      classroomId: room102.id,
      branchId: branch.id,
      teacherEmployeeId: teacherEmployeesByCode['EMP-TCH-002'].id,
      days: ['MONDAY', 'WEDNESDAY'],
      start: '19:00',
      end: '21:00',
    },
    {
      groupCode: 'MATH-01-EVE',
      classroomId: room202.id,
      branchId: chilonzor.id,
      teacherEmployeeId: teacherEmployeesByCode['EMP-TCH-003'].id,
      days: ['TUESDAY', 'THURSDAY', 'SATURDAY'],
      start: '16:00',
      end: '17:30',
    },
  ];

  let scheduleCount = 0;
  let lessonCount = 0;
  const firstLessonByGroupDay: Record<string, { id: string }> = {};
  for (const sd of scheduleDefs) {
    const group = groupsByCode[sd.groupCode];
    const groupRecord = await prisma.studentGroup.findUniqueOrThrow({ where: { id: group.id } });

    for (const day of sd.days) {
      let schedule = await prisma.schedule.findFirst({ where: { groupId: group.id, dayOfWeek: day, startTime: sd.start } });
      schedule ??= await prisma.schedule.create({
        data: {
          groupId: group.id,
          teacherEmployeeId: sd.teacherEmployeeId,
          classroomId: sd.classroomId,
          branchId: sd.branchId,
          dayOfWeek: day,
          startTime: sd.start,
          endTime: sd.end,
          startDate: groupRecord.startDate,
          status: 'ACTIVE',
        },
      });
      scheduleCount++;

      const dates = lessonDatesFor(groupRecord.startDate, day, 4);
      for (const [i, date] of dates.entries()) {
        const scheduledStart = atTime(date, sd.start);
        const scheduledEnd = atTime(date, sd.end);
        const lesson = await prisma.lesson.upsert({
          where: { scheduleId_scheduledStart: { scheduleId: schedule.id, scheduledStart } },
          create: {
            groupId: group.id,
            scheduleId: schedule.id,
            teacherEmployeeId: sd.teacherEmployeeId,
            classroomId: sd.classroomId,
            branchId: sd.branchId,
            scheduledStart,
            scheduledEnd,
          },
          update: {},
        });
        lessonCount++;
        if (i === 0) firstLessonByGroupDay[`${sd.groupCode}:${day}`] = { id: lesson.id };
      }
    }
  }

  // A few explicit status overrides so every LessonStatus value (not just the
  // SCHEDULED default) has a real example to browse — mirrors how the
  // enrollment demo data above deliberately includes a TRANSFERRED and a
  // COMPLETED row alongside the ACTIVE ones. Guarded on "still SCHEDULED" so
  // a live admin's own change to one of these rows is never clobbered by a
  // later re-run of this seed.
  async function overrideIfStillScheduled(lessonRef: { id: string } | undefined, data: Prisma.LessonUpdateInput): Promise<void> {
    if (!lessonRef) return;
    const current = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonRef.id } });
    if (current.status !== 'SCHEDULED') return;
    await prisma.lesson.update({ where: { id: lessonRef.id }, data });
  }

  const engMonday = firstLessonByGroupDay['ENG-A1-01:MONDAY'];
  await overrideIfStillScheduled(engMonday, { status: 'CANCELLED', notes: 'Public holiday — rescheduled.' });

  const pyMonday = firstLessonByGroupDay['PY-BACK-01:MONDAY'];
  if (pyMonday) {
    const l = await prisma.lesson.findUniqueOrThrow({ where: { id: pyMonday.id } });
    await overrideIfStillScheduled(pyMonday, { status: 'IN_PROGRESS', actualStart: l.scheduledStart });
  }

  const mathTuesday = firstLessonByGroupDay['MATH-01-EVE:TUESDAY'];
  if (mathTuesday) {
    const l = await prisma.lesson.findUniqueOrThrow({ where: { id: mathTuesday.id } });
    await overrideIfStillScheduled(mathTuesday, {
      status: 'COMPLETED',
      actualStart: l.scheduledStart,
      actualEnd: l.scheduledEnd,
      topic: 'Linear equations — introduction',
      homework: 'Exercises 1-10, page 42',
    });
  }

  const mathThursday = firstLessonByGroupDay['MATH-01-EVE:THURSDAY'];
  await overrideIfStillScheduled(mathThursday, { status: 'CANCELLED' });

  // Phase F — StudentAttendance demo rows against the lessons just generated
  // above. Deliberately reuses the same four lessons the status-overrides
  // above already touched, so the demo data tells one consistent story:
  // engMonday stays untouched (CANCELLED lessons can never receive
  // attendance — this is also exercised by a unit/e2e test, not just left
  // implicit here), mathTuesday/mathThursday/pyMonday each get real marks
  // covering every StudentAttendanceStatus value.
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  async function markAttendance(lessonRef: { id: string } | undefined, studentCode: string, status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED') {
    if (!lessonRef) return;
    const studentId = studentsByCode[studentCode].id;
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonRef.id } });
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId, groupId: lesson.groupId, status: { not: 'CANCELLED' }, startDate: { lte: lesson.scheduledStart } },
      orderBy: { startDate: 'desc' },
    });
    await prisma.studentAttendance.upsert({
      where: { lessonId_studentId: { lessonId: lessonRef.id, studentId } },
      create: { lessonId: lessonRef.id, studentId, enrollmentId: enrollment?.id, status, markedByUserId: admin.id },
      update: {},
    });
  }

  await markAttendance(mathTuesday, 'STU-000006', 'PRESENT');
  await markAttendance(mathTuesday, 'STU-000007', 'LATE');
  await markAttendance(mathThursday, 'STU-000006', 'ABSENT');
  await markAttendance(mathThursday, 'STU-000007', 'ABSENT');
  await markAttendance(pyMonday, 'STU-000004', 'PRESENT');
  await markAttendance(pyMonday, 'STU-000005', 'EXCUSED');
  const attendanceCount = await prisma.studentAttendance.count();

  console.log(
    `  -> 2 branches, 5 classrooms, 3 course categories, 6 courses, 3 teacher profiles, 5 groups, 8 students, 9 enrollments, ${scheduleCount} schedules, ${lessonCount} lessons, ${attendanceCount} attendance records ensured`,
  );
}

/**
 * A real, logged-in-able demo account for the "Teacher" RBAC role, linked to
 * one of the Phase D teacher employees — needed to actually exercise
 * StudentAttendanceService's teacher-scoping (own groups/lessons only) as a
 * genuine teacher rather than only as Admin. Sarvinoz Tashkentova
 * (EMP-TCH-001) teaches IELTS Weekend (IELTS-02), which already has real
 * schedules/enrollments seeded above.
 */
async function seedDemoTeacherUser(): Promise<void> {
  const teacherRole = await prisma.role.findUnique({ where: { name: 'Teacher' } });
  if (!teacherRole) return; // defensive — seeded above in this same run

  const password = process.env.SEED_TEACHER_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 10);

  // Two distinct teacher logins (Phase K) — "Teacher A cannot modify
  // Teacher B's group/lesson/attendance/grades" is untestable with only
  // one teacher account to log in as.
  const demoTeachers = [
    { employeeCode: 'EMP-TCH-001', username: 'teacher.sarvinoz', email: 'sarvinoz.tashkentova@erp.local' },
    { employeeCode: 'EMP-TCH-002', username: 'teacher.jahongir', email: 'jahongir.rustamov@erp.local' },
  ];
  for (const demo of demoTeachers) {
    const teacherEmployee = await prisma.employee.findUnique({ where: { employeeCode: demo.employeeCode }, include: { user: { select: { username: true } } } });
    if (!teacherEmployee) continue; // defensive — seeded above in this same run
    // Already has a login (e.g. re-issued as a numeric login from the admin UI) — leave it alone.
    if (teacherEmployee.user && teacherEmployee.user.username !== demo.username) {
      console.log(`  -> ${demo.employeeCode} already has login ${teacherEmployee.user.username} — skipped`);
      continue;
    }
    await prisma.user.upsert({
      where: { username: demo.username },
      create: {
        fullName: teacherEmployee.fullName,
        email: demo.email,
        username: demo.username,
        passwordHash,
        temporaryPassword: encryptCredential(password),
        roleId: teacherRole.id,
        employeeId: teacherEmployee.id,
        status: 'ACTIVE',
      },
      update: {},
    });
    console.log(`  -> ${demo.username} / ${password} (Teacher role, linked to ${demo.employeeCode})`);
  }
}

/**
 * One demo login per remaining non-Admin/non-Teacher role, purely so the
 * Phase J dashboard's per-role RBAC differences can actually be logged into
 * and browser-verified (mirrors seedDemoTeacherUser's Phase F precedent).
 * None of these need an Employee link — Manager/Accountant/Reception scoping
 * is permission-based only, not teacher-scope-narrowed.
 */
async function seedDemoRoleUsers(): Promise<void> {
  const password = process.env.SEED_DEMO_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 10);
  const demoUsers = [
    { username: 'manager.aziza', fullName: 'Aziza Karimova', email: 'aziza.karimova@erp.local', roleName: 'Manager' },
    { username: 'accountant.bekzod', fullName: 'Bekzod Yusupov', email: 'bekzod.yusupov@erp.local', roleName: 'Accountant' },
    { username: 'reception.gulnora', fullName: 'Gulnora Saidova', email: 'gulnora.saidova@erp.local', roleName: 'Receptionist' },
  ];

  for (const demo of demoUsers) {
    const role = await prisma.role.findUnique({ where: { name: demo.roleName } });
    if (!role) continue; // defensive — all seeded above in this same run
    await prisma.user.upsert({
      where: { username: demo.username },
      create: { fullName: demo.fullName, email: demo.email, username: demo.username, passwordHash, temporaryPassword: encryptCredential(password), roleId: role.id, status: 'ACTIVE' },
      update: {},
    });
    console.log(`  -> ${demo.username} / ${password} (${demo.roleName} role)`);
  }
}

/**
 * Phase G demo data: a small Discount catalog, one active StudentDiscount
 * grant, and one TuitionCharge per demo scenario below — each pushed through
 * to a DIFFERENT final status (PAID/PARTIALLY_PAID/OVERDUE/PENDING with a
 * discount applied/CANCELLED) against the enrollments seedEducationCoreDemo
 * already created, so the payments, student finance and tuition report
 * pages all have something real to show out of the box. Idempotent: guarded per-scenario by "does this enrollment+billingPeriod
 * already have a charge", so re-running the seed never double-bills.
 */
async function seedTuitionBillingDemo(): Promise<void> {
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });

  async function findEnrollment(studentCode: string, groupCode: string) {
    const student = await prisma.student.findUniqueOrThrow({ where: { studentCode } });
    const group = await prisma.studentGroup.findUniqueOrThrow({ where: { code: groupCode } });
    return prisma.enrollment.findFirstOrThrow({ where: { studentId: student.id, groupId: group.id }, orderBy: { createdAt: 'desc' } });
  }

  async function findOrCreateDiscount(name: string, type: 'PERCENTAGE' | 'FIXED', value: string, description: string) {
    const existing = await prisma.discount.findFirst({ where: { name } });
    if (existing) return existing;
    return prisma.discount.create({ data: { name, type, value, description } });
  }

  const siblingDiscount = await findOrCreateDiscount('Sibling Discount', 'PERCENTAGE', '10', '10% off for a second sibling enrolled at the center.');
  await findOrCreateDiscount('Early Payment', 'FIXED', '50000', 'Flat discount for paying before the 5th of the month.');
  await findOrCreateDiscount('Merit Scholarship', 'PERCENTAGE', '50', 'Half-tuition scholarship for top-performing students.');

  /** Bills one enrollment for one period, optionally paying/allocating/cancelling it, entirely skipped if that (enrollment, billingPeriod) was already billed by an earlier seed run. */
  async function billScenario(params: {
    studentCode: string;
    groupCode: string;
    billingPeriod: string;
    dueDate: string;
    grantDiscountId?: string;
    payAmount?: number; // omit for an unpaid demo charge
    cancel?: boolean;
    forceStatus?: 'OVERDUE'; // demo-only override so an unpaid past-due charge visibly reads OVERDUE without waiting for the daily scan
  }) {
    const enrollment = await findEnrollment(params.studentCode, params.groupCode);
    const existing = await prisma.tuitionCharge.findFirst({ where: { enrollmentId: enrollment.id, billingPeriod: params.billingPeriod } });
    if (existing) return;

    if (params.grantDiscountId) {
      const alreadyGranted = await prisma.studentDiscount.findFirst({ where: { studentId: enrollment.studentId, discountId: params.grantDiscountId } });
      if (!alreadyGranted) {
        await prisma.studentDiscount.create({
          data: { studentId: enrollment.studentId, discountId: params.grantDiscountId, startDate: new Date('2026-09-01'), notes: 'Seeded demo grant.' },
        });
      }
    }

    const amount = Number(enrollment.agreedTuition ?? 0);
    let discountAmount = 0;
    if (params.grantDiscountId) {
      const discount = await prisma.discount.findUniqueOrThrow({ where: { id: params.grantDiscountId } });
      discountAmount = discount.type === 'PERCENTAGE' ? (amount * Number(discount.value)) / 100 : Number(discount.value);
    }
    const netAmount = Math.max(amount - discountAmount, 0);

    const charge = await prisma.tuitionCharge.create({
      data: {
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
        billingPeriod: params.billingPeriod,
        amount,
        discountAmount,
        netAmount,
        dueDate: new Date(params.dueDate),
        status: params.forceStatus ?? 'PENDING',
      },
    });


    if (params.cancel) {
      await prisma.tuitionCharge.update({ where: { id: charge.id }, data: { status: 'CANCELLED' } });
      return;
    }

    if (!params.payAmount) return;

    const paymentNumber = await generateDocumentNumber('PAY', () => prisma.payment.count());
    const payment = await prisma.payment.create({
      data: {
        paymentNumber,
        direction: 'INBOUND',
        amount: params.payAmount,
        method: 'CASH',
        status: 'COMPLETED',
        referenceType: 'TUITION_CHARGE',
        referenceId: enrollment.studentId,
        paidAt: new Date(params.dueDate),
        recordedByUserId: admin.id,
      },
    });
    await prisma.tuitionAllocation.create({
      data: { paymentId: payment.id, tuitionChargeId: charge.id, amount: params.payAmount, allocatedByUserId: admin.id },
    });
    await prisma.tuitionCharge.update({
      where: { id: charge.id },
      data: { status: params.payAmount >= netAmount ? 'PAID' : 'PARTIALLY_PAID' },
    });
  }

  // Fully paid.
  await billScenario({ studentCode: 'STU-000001', groupCode: 'ENG-A1-01', billingPeriod: '2026-09', dueDate: '2026-09-30', payAmount: 600000 });
  // Partially paid.
  await billScenario({ studentCode: 'STU-000002', groupCode: 'IELTS-01', billingPeriod: '2026-09', dueDate: '2026-09-30', payAmount: 400000 });
  // Past due, unpaid — OVERDUE (demo-forced so it's visible without waiting for the daily scheduler scan).
  await billScenario({ studentCode: 'STU-000004', groupCode: 'PY-BACK-01', billingPeriod: '2026-07', dueDate: '2026-07-31', forceStatus: 'OVERDUE' });
  // Unpaid, with an active Sibling Discount grant — demonstrates discount computation (1,100,000 - 10% = 990,000).
  await billScenario({ studentCode: 'STU-000005', groupCode: 'PY-BACK-01', billingPeriod: '2026-09', dueDate: '2026-09-30', grantDiscountId: siblingDiscount.id });
  // Billed then cancelled.
  await billScenario({ studentCode: 'STU-000007', groupCode: 'MATH-01-EVE', billingPeriod: '2026-08', dueDate: '2026-08-31', cancel: true });

  const [chargeCount, discountCount, grantCount, paymentCount] = await Promise.all([
    prisma.tuitionCharge.count(),
    prisma.discount.count(),
    prisma.studentDiscount.count(),
    prisma.payment.count({ where: { referenceType: 'TUITION_CHARGE' } }),
  ]);
  console.log(`  -> ${chargeCount} tuition charges, ${discountCount} discounts, ${grantCount} discount grants, ${paymentCount} tuition payments ensured`);
}

/**
 * Phase H demo data: one Exam against IELTS Weekend (IELTS-02) — the group
 * the demo Teacher login (teacher.sarvinoz / EMP-TCH-001) actually teaches,
 * so logging in as that account and opening /exams shows something real —
 * with Assessments for its enrolled students (deliberately one PASS and one
 * FAIL, to exercise both branches of the grading scale and pass-rate math).
 */
async function seedExamsGradesDemo(): Promise<void> {
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const course = await prisma.course.findUniqueOrThrow({ where: { code: 'IELTS' } });
  const group = await prisma.studentGroup.findUniqueOrThrow({ where: { code: 'IELTS-02' } });
  const teacher = await prisma.employee.findUniqueOrThrow({ where: { employeeCode: 'EMP-TCH-001' } });

  const existingExam = await prisma.exam.findFirst({ where: { groupId: group.id, title: 'IELTS Weekend — Midterm' } });
  let examId = existingExam?.id;
  if (!existingExam) {
    const exam = await prisma.exam.create({
      data: {
        title: 'IELTS Weekend — Midterm',
        courseId: course.id,
        groupId: group.id,
        teacherEmployeeId: teacher.id,
        date: new Date('2026-09-20'),
        maxScore: '100',
        passingScore: '60',
        type: 'MIDTERM',
        status: 'COMPLETED',
        notes: 'Seeded demo exam.',
      },
    });
    examId = exam.id;
  }

  const enrollments = await prisma.enrollment.findMany({ where: { groupId: group.id, status: { not: 'CANCELLED' } }, take: 2 });
  const scores = [82, 45]; // one clear PASS (B), one clear FAIL — exercises both branches of the default grading scale.
  for (const [index, enrollment] of enrollments.entries()) {
    const existing = await prisma.assessment.findFirst({ where: { examId, studentId: enrollment.studentId } });
    if (existing) continue;
    const score = scores[index] ?? 70;
    const percentage = score; // maxScore is 100, so percentage === score here.
    await prisma.assessment.create({
      data: {
        examId: examId!,
        studentId: enrollment.studentId,
        score,
        percentage,
        grade: gradeForPercentage(percentage),
        evaluatedByUserId: admin.id,
        evaluatedAt: new Date('2026-09-21'),
      },
    });
  }

  const [examCount, assessmentCount] = await Promise.all([prisma.exam.count(), prisma.assessment.count()]);
  console.log(`  -> ${examCount} exams, ${assessmentCount} assessments ensured`);
}

/**
 * Student portal demo: a login for Aziz Karimov (STU-000001, group ENG-A1-01),
 * three homework assignments in his group covering every state (graded,
 * submitted, still to do) and two upcoming extra lessons, one of which he has
 * signed up for. Idempotent — keyed by username / homework title / lesson title.
 */
async function seedStudentPortalDemo(): Promise<void> {
  const password = process.env.SEED_DEMO_PASSWORD ?? 'ChangeMe123!';
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'Student' } });
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const student = await prisma.student.findUniqueOrThrow({ where: { studentCode: 'STU-000001' } });
  const group = await prisma.studentGroup.findUniqueOrThrow({ where: { code: 'ENG-A1-01' } });

  if (!student.userId) {
    const user = await prisma.user.upsert({
      where: { username: 'student.aziz' },
      create: { fullName: student.fullName, email: 'aziz.karimov@students.local', username: 'student.aziz', passwordHash: await bcrypt.hash(password, 10), temporaryPassword: encryptCredential(password), roleId: role.id, status: 'ACTIVE' },
      update: {},
    });
    await prisma.student.update({ where: { id: student.id }, data: { userId: user.id } });
    console.log(`  -> student.aziz / ${password} (Student role, linked to STU-000001)`);
  } else {
    console.log('  -> STU-000001 already has a login — skipped (see Sozlamalar → Loginlar va parollar)');
  }

  const day = 86_400_000;
  const now = Date.now();
  const homeworkDefs = [
    { title: 'Present Simple — 20 ta gap', description: "Present Simple zamonida o'zingiz haqingizda 20 ta gap yozing.", due: now - 5 * day, submission: { answerText: 'I wake up at 7 am. I go to school by bus. ...', score: 85, feedback: 'Yaxshi! 3-va 12-gaplarda artikl xatosi bor.' } },
    { title: 'Vocabulary: Family', description: "Darslikdagi 'Family' mavzusidagi 30 ta so'zni yodlang va har biri bilan gap tuzing.", due: now + 1 * day, submission: { answerText: 'mother — My mother is a doctor. father — ...' } },
    { title: 'Reading: My Town', description: "45-sahifadagi matnni o'qing va 1–8 savollarga javob bering.", due: now + 4 * day },
  ];
  for (const def of homeworkDefs) {
    let homework = await prisma.homework.findFirst({ where: { groupId: group.id, title: def.title } });
    homework ??= await prisma.homework.create({
      data: { groupId: group.id, title: def.title, description: def.description, dueDate: new Date(def.due), createdByUserId: admin.id },
    });
    if (def.submission && !(await prisma.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId: homework.id, studentId: student.id } } }))) {
      const graded = 'score' in def.submission;
      await prisma.homeworkSubmission.create({
        data: {
          homeworkId: homework.id,
          studentId: student.id,
          answerText: def.submission.answerText,
          submittedAt: new Date(def.due - day),
          ...(graded && { status: 'GRADED' as const, score: def.submission.score, feedback: def.submission.feedback, gradedAt: new Date(def.due), gradedByUserId: admin.id }),
        },
      });
    }
  }

  const teacher = await prisma.employee.findUniqueOrThrow({ where: { employeeCode: 'EMP-TCH-001' } });
  const branch = await prisma.branch.findUniqueOrThrow({ where: { code: 'BR-MAIN' } });
  const lessonDefs = [
    { title: 'Speaking Club', description: "Erkin mavzularda ingliz tilida suhbat. Barcha darajalar uchun.", startsIn: 2, hours: [16, 17.5], capacity: 12, register: true },
    { title: 'IELTS Writing Task 2 — masterklass', description: "Essay tuzilishi va baholash mezonlari bo'yicha amaliy mashg'ulot.", startsIn: 5, hours: [10, 12], capacity: 8, register: false },
  ];
  for (const def of lessonDefs) {
    let lesson = await prisma.extraLesson.findFirst({ where: { title: def.title } });
    if (!lesson) {
      const start = new Date(now + def.startsIn * day);
      start.setHours(Math.floor(def.hours[0]), (def.hours[0] % 1) * 60, 0, 0);
      const end = new Date(start);
      end.setHours(Math.floor(def.hours[1]), (def.hours[1] % 1) * 60, 0, 0);
      lesson = await prisma.extraLesson.create({
        data: { title: def.title, description: def.description, teacherEmployeeId: teacher.id, branchId: branch.id, room: 'Room 101', startsAt: start, endsAt: end, capacity: def.capacity, createdByUserId: admin.id },
      });
    }
    if (def.register) {
      await prisma.extraLessonRegistration.upsert({
        where: { extraLessonId_studentId: { extraLessonId: lesson.id, studentId: student.id } },
        create: { extraLessonId: lesson.id, studentId: student.id },
        update: {},
      });
    }
  }
  console.log(`  -> ${homeworkDefs.length} homework, ${lessonDefs.length} extra lessons ensured`);
}

/**
 * Re-running this seed against a live deployment (e.g. to adjust a starter
 * role's default grants) rewrites RolePermission rows directly in Postgres,
 * bypassing RolesService.updatePermissions() — the only place that normally
 * invalidates RolePermissionsCacheService's Redis cache (1h TTL). Without
 * this, an admin could be seeded a new permission and still get a stale 403
 * for up to an hour. Best-effort: a Redis outage here must never fail the
 * (far more important) database seeding above, since the TTL self-corrects.
 */
async function flushRolePermissionsCache(): Promise<void> {
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    lazyConnect: true,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    let cursor = '0';
    let deleted = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'role-permissions:*', 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await redis.del(...keys);
      }
    } while (cursor !== '0');
    console.log(`  -> ${deleted} cached role-permission entries invalidated`);
  } catch (error) {
    console.warn(`  -> Could not reach Redis to invalidate the role-permissions cache (it will self-expire within 1 hour): ${(error as Error).message}`);
  } finally {
    redis.disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
