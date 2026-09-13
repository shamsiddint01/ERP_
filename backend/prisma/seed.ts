import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, PermissionAction, type AccountCategory, type AccountType, type Prisma, type ScheduleDayOfWeek, type TransactionReferenceType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Redis } from 'ioredis';
import { PERMISSION_MODULES } from '../src/shared/constants/permission-modules.constant.js';
import { ACCOUNT_CODES } from '../src/shared/finance/account-codes.constant.js';
import { generateDocumentNumber } from '../src/shared/utils/document-number.util.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const DEBIT_NORMAL_CATEGORIES: AccountCategory[] = ['ASSET', 'EXPENSE'];

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
    description: 'Oversees daily operations across sales, purchasing, inventory and HR.',
    grants: {
      customers: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
      products: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
      inventory: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
      suppliers: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
      purchases: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
      orders: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
      invoices: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
      payments: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EXPORT],
      expenses: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.APPROVE, PermissionAction.EXPORT],
      employees: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      departments: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
      positions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
      attendance: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      compensation: [PermissionAction.VIEW],
      payroll: [PermissionAction.VIEW, PermissionAction.EXPORT],
      finance: [PermissionAction.VIEW, PermissionAction.EXPORT],
      reports: [PermissionAction.VIEW, PermissionAction.EXPORT],
      notifications: [PermissionAction.VIEW],
      // Phase F — "Manager: view/manage".
      student_attendance: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
      // Phase G — "Manager: view/appropriate management" — can see billing and
      // step in to approve/cancel a charge, but catalog upkeep (creating
      // charges, managing the Discount catalog) stays with Accountant.
      tuition: [PermissionAction.VIEW, PermissionAction.APPROVE, PermissionAction.EXPORT],
      discounts: [PermissionAction.VIEW],
    },
  },
  {
    name: 'Accountant',
    description: 'Owns finance, payments, expenses and invoicing.',
    grants: {
      customers: [PermissionAction.VIEW],
      suppliers: [PermissionAction.VIEW],
      invoices: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
      payments: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
      finance: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
      expenses: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
      employees: [PermissionAction.VIEW],
      departments: [PermissionAction.VIEW],
      positions: [PermissionAction.VIEW],
      attendance: [PermissionAction.VIEW],
      compensation: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
      payroll: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
      reports: [PermissionAction.VIEW, PermissionAction.EXPORT],
      notifications: [PermissionAction.VIEW],
      // Phase F — "Accountant: generally read-only".
      student_attendance: [PermissionAction.VIEW],
      // Phase G — "Accountant: full" tuition/billing/discount administration.
      tuition: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
      discounts: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
    },
  },
  {
    name: 'Sales Rep',
    description: 'Handles customers, sales orders and invoices.',
    grants: {
      customers: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
      products: [PermissionAction.VIEW],
      inventory: [PermissionAction.VIEW],
      orders: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
      invoices: [PermissionAction.VIEW, PermissionAction.CREATE],
      payments: [PermissionAction.VIEW, PermissionAction.CREATE],
      employees: [PermissionAction.VIEW],
      notifications: [PermissionAction.VIEW],
    },
  },
  {
    name: 'Warehouse Staff',
    description: 'Manages stock levels, receiving and purchase fulfillment.',
    grants: {
      products: [PermissionAction.VIEW],
      inventory: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
      suppliers: [PermissionAction.VIEW],
      purchases: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
      orders: [PermissionAction.VIEW],
      employees: [PermissionAction.VIEW],
      notifications: [PermissionAction.VIEW],
    },
  },
  // Phase F — a teacher's *actual* scope (their own groups/lessons only) is
  // enforced in StudentAttendanceService based on their TeacherProfile
  // linkage, not by this role name — but they still need these blanket
  // module-level grants to reach the relevant pages/endpoints at all.
  {
    name: 'Teacher',
    description: "Takes attendance for their own groups' lessons.",
    grants: {
      groups: [PermissionAction.VIEW],
      schedules: [PermissionAction.VIEW],
      lessons: [PermissionAction.VIEW],
      students: [PermissionAction.VIEW],
      // enrollments:VIEW is what lets the Lesson Attendance page build the
      // eligible-student roster in the first place — without it, a teacher
      // couldn't mark attendance for even their OWN lesson.
      enrollments: [PermissionAction.VIEW],
      student_attendance: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
      notifications: [PermissionAction.VIEW],
    },
  },
  {
    name: 'Reception',
    description: "Front-desk: looks up students, groups and attendance on parents' behalf.",
    grants: {
      students: [PermissionAction.VIEW],
      guardians: [PermissionAction.VIEW],
      groups: [PermissionAction.VIEW],
      lessons: [PermissionAction.VIEW],
      student_attendance: [PermissionAction.VIEW],
      notifications: [PermissionAction.VIEW],
      // Phase G — "Reception: create/view payments according to policy": can
      // see what a family owes and take a payment against it (including
      // assigning that payment to the right charge — structurally the same
      // action as recording it), but never bills a new charge or touches the
      // Discount catalog.
      tuition: [PermissionAction.VIEW, PermissionAction.EDIT],
      payments: [PermissionAction.VIEW, PermissionAction.CREATE],
    },
  },
];

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

  console.log('Seeding Chart of Accounts...');
  const accountIdByCode = await seedChartOfAccounts();

  console.log('Seeding Expense Categories...');
  await seedExpenseCategories(accountIdByCode);

  console.log('Backfilling Phase 4 Transaction/PurchaseOrder history into the double-entry ledger...');
  await backfillHistoricalJournalEntries(adminRole.id, accountIdByCode);

  console.log('Seeding Education Center demo data (Phase A)...');
  await seedEducationCoreDemo();

  console.log('Seeding a demo Teacher login (Phase F)...');
  await seedDemoTeacherUser();

  console.log('Seeding tuition billing/payments/discounts demo data (Phase G)...');
  await seedTuitionBillingDemo(accountIdByCode);

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

  const guardianDefs = [
    { phone: '+998907776655', fullName: 'Karim Karimov', rel: 'FATHER' as const, studentCode: 'STU-000001', isPrimary: true },
    { phone: '+998907776656', fullName: 'Nodira Yusupova', rel: 'MOTHER' as const, studentCode: 'STU-000002', isPrimary: true },
    { phone: '+998907776657', fullName: 'Baxtiyor Aliyev', rel: 'FATHER' as const, studentCode: 'STU-000003', isPrimary: true },
    { phone: '+998907776658', fullName: 'Gulnora Xolmatova', rel: 'MOTHER' as const, studentCode: 'STU-000004', isPrimary: true },
    // Otabek has two guardians — exercises multi-guardian linking and the single-primary rule.
    { phone: '+998907776659', fullName: 'Rustam Ergashev', rel: 'FATHER' as const, studentCode: 'STU-000005', isPrimary: true },
    { phone: '+998907776660', fullName: 'Zarina Ergasheva', rel: 'MOTHER' as const, studentCode: 'STU-000005', isPrimary: false },
  ];
  for (const gd of guardianDefs) {
    // Guardian.phone isn't unique (siblings share a parent), so key the demo
    // guardian by phone via findFirst + create rather than upsert.
    let guardian = await prisma.guardian.findFirst({ where: { phone: gd.phone, fullName: gd.fullName } });
    guardian ??= await prisma.guardian.create({
      data: { fullName: gd.fullName, phone: gd.phone, relationshipType: gd.rel, status: 'ACTIVE' },
    });
    await prisma.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId: studentsByCode[gd.studentCode].id, guardianId: guardian.id } },
      create: { studentId: studentsByCode[gd.studentCode].id, guardianId: guardian.id, relationship: gd.rel, isPrimary: gd.isPrimary },
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

  const leadDefs = [
    {
      fullName: 'Jasur Toshpulatov',
      phone: '+998935550011',
      preferredCourse: 'PY-BASE',
      source: 'INSTAGRAM',
      status: 'NEW' as const,
      activities: [{ type: 'NOTE' as const, description: 'Inbound Instagram inquiry about Python Basics.' }],
    },
    {
      fullName: 'Dilnoza Rashidova',
      phone: '+998935550012',
      preferredCourse: 'IELTS',
      source: 'REFERRAL',
      status: 'CONTACTED' as const,
      activities: [
        { type: 'CALL' as const, description: 'Called to introduce the IELTS Intensive group.' },
        { type: 'FOLLOW_UP' as const, description: 'Scheduled a follow-up call next week to confirm the trial lesson.' },
      ],
    },
    {
      fullName: 'Feruza Nematova',
      phone: '+998935550013',
      preferredCourse: 'ENG-GEN',
      source: 'ORGANIC',
      status: 'TRIAL_SCHEDULED' as const,
      activities: [
        { type: 'CALL' as const, description: 'Called and explained the General English program.' },
        { type: 'TRIAL' as const, description: 'Trial lesson booked for Saturday 11:00.' },
      ],
    },
    {
      fullName: 'Sherzod Yoldashev',
      phone: '+998935550014',
      preferredCourse: 'PY-BASE',
      source: 'WALK_IN',
      status: 'TRIAL_COMPLETED' as const,
      activities: [
        { type: 'TRIAL' as const, description: 'Attended the Python Basics trial lesson.' },
        { type: 'FOLLOW_UP' as const, description: 'Waiting on family decision before enrolling.' },
      ],
    },
    {
      fullName: 'Kamola Rahimova',
      phone: '+998935550015',
      preferredCourse: 'IELTS',
      source: 'FACEBOOK',
      status: 'LOST' as const,
      activities: [
        { type: 'CALL' as const, description: 'Called twice, no response.' },
        { type: 'NOTE' as const, description: 'Marked as lost — chose a different center closer to home.' },
      ],
    },
    {
      fullName: 'Umida Sobirova',
      phone: '+998935550016',
      preferredCourse: 'PY-BASE',
      source: 'REFERRAL',
      status: 'CONTACTED' as const,
      activities: [{ type: 'CALL' as const, description: 'Referred by an existing student; called to introduce Python Basics.' }],
    },
    {
      fullName: 'Bekzod Mirzayev',
      phone: '+998935550017',
      preferredCourse: 'ENG-GEN',
      source: 'WEBSITE',
      status: 'NEW' as const,
      activities: [] as Array<{ type: 'CALL' | 'MESSAGE' | 'MEETING' | 'TRIAL' | 'NOTE' | 'FOLLOW_UP'; description: string }>,
    },
  ];
  for (const l of leadDefs) {
    let lead = await prisma.lead.findFirst({ where: { phone: l.phone, fullName: l.fullName } });
    lead ??= await prisma.lead.create({
      data: {
        fullName: l.fullName,
        phone: l.phone,
        preferredCourseId: coursesByCode[l.preferredCourse].id,
        preferredBranchId: branch.id,
        source: l.source,
        status: l.status,
      },
    });
    const existingActivityCount = await prisma.leadActivity.count({ where: { leadId: lead.id } });
    if (existingActivityCount === 0) {
      for (const activity of l.activities) {
        await prisma.leadActivity.create({ data: { leadId: lead.id, type: activity.type, description: activity.description } });
      }
    }
  }

  // Phase E — Schedules + Lessons. One weekly Schedule row per (group, day),
  // covering both branches, all three teachers and a teacher-less group, plus
  // a handful of generated Lesson rows per schedule so the workflow actions
  // (start/complete/cancel/no-show) all have real historical examples to
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
  await overrideIfStillScheduled(mathThursday, { status: 'NO_SHOW' });

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
    `  -> 2 branches, 5 classrooms, 3 course categories, 6 courses, 3 teacher profiles, 5 groups, 8 students, 6 guardians, 9 enrollments, 7 leads, 10 lead activities, ${scheduleCount} schedules, ${lessonCount} lessons, ${attendanceCount} attendance records ensured`,
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
  const teacherEmployee = await prisma.employee.findUnique({ where: { employeeCode: 'EMP-TCH-001' } });
  if (!teacherRole || !teacherEmployee) return; // defensive — both are seeded above in this same run

  const password = process.env.SEED_TEACHER_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { username: 'teacher.sarvinoz' },
    create: {
      fullName: teacherEmployee.fullName,
      email: 'sarvinoz.tashkentova@erp.local',
      username: 'teacher.sarvinoz',
      passwordHash,
      roleId: teacherRole.id,
      employeeId: teacherEmployee.id,
      status: 'ACTIVE',
    },
    update: {},
  });
  console.log(`  -> teacher.sarvinoz / ${password} (Teacher role, linked to EMP-TCH-001)`);
}

/**
 * Phase G demo data: a small Discount catalog, one active StudentDiscount
 * grant, and one TuitionCharge per demo scenario below — each pushed through
 * to a DIFFERENT final status (PAID/PARTIALLY_PAID/OVERDUE/PENDING with a
 * discount applied/CANCELLED) against the enrollments seedEducationCoreDemo
 * already created, so the /tuition, /students/:id/finance and tuition report
 * pages all have something real to show out of the box. Money movement is
 * posted via postSeedJournalEntry (same helper backfillHistoricalJournalEntries
 * uses) rather than the real TuitionChargeService/PaymentsService, since this
 * script runs outside Nest's DI container — but the Dr/Cr postings mirror
 * FinanceLedgerService.recordTuitionCharge/recordCustomerPayment exactly.
 * Idempotent: guarded per-scenario by "does this enrollment+billingPeriod
 * already have a charge", so re-running the seed never double-bills.
 */
async function seedTuitionBillingDemo(accountIdByCode: Map<string, string>): Promise<void> {
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const arId = accountIdByCode.get(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)!;
  const cashId = accountIdByCode.get(ACCOUNT_CODES.CASH)!;
  const tuitionRevenueId = accountIdByCode.get(ACCOUNT_CODES.TUITION_REVENUE)!;

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

    if (netAmount > 0) {
      await postSeedJournalEntry({
        entryDate: new Date(params.dueDate),
        description: `Tuition billed for ${params.billingPeriod} (${params.studentCode})`,
        referenceType: 'TUITION_CHARGE',
        referenceId: charge.id,
        createdByUserId: admin.id,
        lines: [
          { accountId: arId, debit: netAmount },
          { accountId: tuitionRevenueId, credit: netAmount },
        ],
      });
    }

    if (params.cancel) {
      await prisma.tuitionCharge.update({ where: { id: charge.id }, data: { status: 'CANCELLED' } });
      if (netAmount > 0) {
        await postSeedJournalEntry({
          entryDate: new Date(params.dueDate),
          description: `Tuition charge for ${params.studentCode} (${params.billingPeriod}) cancelled`,
          referenceType: 'TUITION_CHARGE',
          referenceId: charge.id,
          createdByUserId: admin.id,
          lines: [
            { accountId: tuitionRevenueId, debit: netAmount },
            { accountId: arId, credit: netAmount },
          ],
        });
      }
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
    await postSeedJournalEntry({
      entryDate: new Date(params.dueDate),
      description: `Payment ${paymentNumber} received via CASH`,
      referenceType: 'PAYMENT',
      referenceId: payment.id,
      createdByUserId: admin.id,
      lines: [
        { accountId: cashId, debit: params.payAmount },
        { accountId: arId, credit: params.payAmount },
      ],
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
  // Billed then cancelled — demonstrates the reversing journal entry.
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

/**
 * Well-known accounts every module posts against by code (see ACCOUNT_CODES).
 * Header (group) accounts exist purely for hierarchy display — isPostable
 * false — and are never targeted by a journal line. Everything here is
 * isSystemAccount so it cannot be deactivated or deleted via the API.
 */
async function seedChartOfAccounts(): Promise<Map<string, string>> {
  type SeedAccount = {
    code: string;
    name: string;
    type: AccountType;
    category: AccountCategory;
    parentCode?: string;
    isPostable: boolean;
  };

  const accounts: SeedAccount[] = [
    { code: '1000', name: 'Assets', type: 'CASH', category: 'ASSET', isPostable: false },
    { code: ACCOUNT_CODES.CASH, name: 'Cash', type: 'CASH', category: 'ASSET', parentCode: '1000', isPostable: true },
    { code: ACCOUNT_CODES.BANK, name: 'Bank', type: 'BANK', category: 'ASSET', parentCode: '1000', isPostable: true },
    { code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, name: 'Accounts Receivable', type: 'RECEIVABLE', category: 'ASSET', parentCode: '1000', isPostable: true },
    { code: ACCOUNT_CODES.INVENTORY, name: 'Inventory', type: 'INVENTORY', category: 'ASSET', parentCode: '1000', isPostable: true },
    { code: '2000', name: 'Liabilities', type: 'PAYABLE', category: 'LIABILITY', isPostable: false },
    { code: ACCOUNT_CODES.ACCOUNTS_PAYABLE, name: 'Accounts Payable', type: 'PAYABLE', category: 'LIABILITY', parentCode: '2000', isPostable: true },
    { code: ACCOUNT_CODES.PAYROLL_PAYABLE, name: 'Payroll Payable', type: 'PAYABLE', category: 'LIABILITY', parentCode: '2000', isPostable: true },
    { code: ACCOUNT_CODES.DEDUCTIONS_PAYABLE, name: 'Payroll Deductions Payable', type: 'PAYABLE', category: 'LIABILITY', parentCode: '2000', isPostable: true },
    { code: '3000', name: 'Equity', type: 'EQUITY', category: 'EQUITY', isPostable: false },
    { code: ACCOUNT_CODES.OWNER_EQUITY, name: "Owner's Equity", type: 'EQUITY', category: 'EQUITY', parentCode: '3000', isPostable: true },
    { code: '4000', name: 'Revenue', type: 'REVENUE', category: 'REVENUE', isPostable: false },
    { code: ACCOUNT_CODES.SALES_REVENUE, name: 'Sales Revenue', type: 'REVENUE', category: 'REVENUE', parentCode: '4000', isPostable: true },
    { code: ACCOUNT_CODES.TUITION_REVENUE, name: 'Tuition Revenue', type: 'REVENUE', category: 'REVENUE', parentCode: '4000', isPostable: true },
    { code: '5000', name: 'Expenses', type: 'EXPENSE', category: 'EXPENSE', isPostable: false },
    { code: ACCOUNT_CODES.RENT_EXPENSE, name: 'Rent Expense', type: 'EXPENSE', category: 'EXPENSE', parentCode: '5000', isPostable: true },
    { code: ACCOUNT_CODES.UTILITIES_EXPENSE, name: 'Utilities Expense', type: 'EXPENSE', category: 'EXPENSE', parentCode: '5000', isPostable: true },
    { code: ACCOUNT_CODES.SALARIES_EXPENSE, name: 'Salaries Expense', type: 'EXPENSE', category: 'EXPENSE', parentCode: '5000', isPostable: true },
    { code: ACCOUNT_CODES.MARKETING_EXPENSE, name: 'Marketing Expense', type: 'EXPENSE', category: 'EXPENSE', parentCode: '5000', isPostable: true },
    { code: ACCOUNT_CODES.TRANSPORT_EXPENSE, name: 'Transport Expense', type: 'EXPENSE', category: 'EXPENSE', parentCode: '5000', isPostable: true },
    { code: ACCOUNT_CODES.OTHER_EXPENSE, name: 'Other Expense', type: 'EXPENSE', category: 'EXPENSE', parentCode: '5000', isPostable: true },
  ];

  const idByCode = new Map<string, string>();
  // Two passes: create/update every account first (so parent ids exist), then link parentCode -> parentId.
  for (const account of accounts) {
    const row = await prisma.account.upsert({
      where: { code: account.code },
      create: {
        code: account.code,
        name: account.name,
        type: account.type,
        category: account.category,
        isPostable: account.isPostable,
        isSystemAccount: true,
      },
      update: { name: account.name, type: account.type, category: account.category, isPostable: account.isPostable, isSystemAccount: true },
    });
    idByCode.set(account.code, row.id);
  }
  for (const account of accounts) {
    if (!account.parentCode) continue;
    await prisma.account.update({ where: { code: account.code }, data: { parentId: idByCode.get(account.parentCode) } });
  }

  console.log(`  -> ${accounts.length} accounts ensured`);
  return idByCode;
}

async function seedExpenseCategories(accountIdByCode: Map<string, string>): Promise<void> {
  const categories: Array<{ name: string; accountCode: string; isSystem?: boolean }> = [
    { name: 'Ijara (Rent)', accountCode: ACCOUNT_CODES.RENT_EXPENSE },
    { name: 'Kommunal xizmatlar (Utilities)', accountCode: ACCOUNT_CODES.UTILITIES_EXPENSE },
    { name: 'Ish haqi (Salaries)', accountCode: ACCOUNT_CODES.SALARIES_EXPENSE },
    { name: 'Reklama (Marketing)', accountCode: ACCOUNT_CODES.MARKETING_EXPENSE },
    { name: 'Transport', accountCode: ACCOUNT_CODES.TRANSPORT_EXPENSE },
    { name: 'Boshqa (Other)', accountCode: ACCOUNT_CODES.OTHER_EXPENSE, isSystem: true },
  ];

  for (const category of categories) {
    const accountId = accountIdByCode.get(category.accountCode);
    await prisma.expenseCategory.upsert({
      where: { name: category.name },
      create: { name: category.name, accountId, isSystem: category.isSystem ?? false },
      update: { accountId },
    });
  }
  console.log(`  -> ${categories.length} expense categories ensured`);
}

/**
 * Posts a balanced journal entry directly (no NestJS DI available in the seed
 * script), mirroring JournalService.postEntry: creates JournalEntry+Lines and
 * updates each Account.currentBalance per normal-balance rules. Used only for
 * the one-time historical backfill below.
 */
async function postSeedJournalEntry(params: {
  entryDate: Date;
  description: string;
  referenceType?: TransactionReferenceType;
  referenceId?: string;
  createdByUserId: string;
  lines: Array<{ accountId: string; debit?: number; credit?: number }>;
}): Promise<string> {
  const entryNumber = await generateDocumentNumber('JE', () => prisma.journalEntry.count());
  const entry = await prisma.journalEntry.create({
    data: {
      entryNumber,
      entryDate: params.entryDate,
      description: params.description,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      createdByUserId: params.createdByUserId,
      lines: { create: params.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0 })) },
    },
  });

  const accounts = await prisma.account.findMany({ where: { id: { in: params.lines.map((l) => l.accountId) } } });
  const categoryById = new Map(accounts.map((a) => [a.id, a.category]));
  for (const line of params.lines) {
    const isDebitNormal = DEBIT_NORMAL_CATEGORIES.includes(categoryById.get(line.accountId)!);
    const delta = isDebitNormal ? (line.debit ?? 0) - (line.credit ?? 0) : (line.credit ?? 0) - (line.debit ?? 0);
    await prisma.account.update({ where: { id: line.accountId }, data: { currentBalance: { increment: delta } } });
  }

  return entry.id;
}

/**
 * One-time migration of the 3 Phase-4 Transaction rows (created before the
 * Chart of Accounts existed) and the 1 already-RECEIVED PurchaseOrder into
 * proper double-entry JournalEntry/JournalLine rows, so the new Trial
 * Balance/General Ledger reports reflect pre-Phase-5 activity too. Every
 * original Transaction row is left completely untouched except for gaining a
 * journalEntryId link; Customer/Supplier balances (already correct from
 * Phase 3/4) are never re-touched, only the new Account.currentBalance is.
 * Guarded by `journalEntryId: null` so re-running the seed is a no-op here.
 */
async function backfillHistoricalJournalEntries(adminRoleId: string, accountIdByCode: Map<string, string>): Promise<void> {
  const cashId = accountIdByCode.get(ACCOUNT_CODES.CASH)!;
  const bankId = accountIdByCode.get(ACCOUNT_CODES.BANK)!;
  const arId = accountIdByCode.get(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)!;
  const apId = accountIdByCode.get(ACCOUNT_CODES.ACCOUNTS_PAYABLE)!;
  const inventoryId = accountIdByCode.get(ACCOUNT_CODES.INVENTORY)!;
  const revenueId = accountIdByCode.get(ACCOUNT_CODES.SALES_REVENUE)!;

  const adminUser = await prisma.user.findFirst({ where: { roleId: adminRoleId }, orderBy: { createdAt: 'asc' } });
  if (!adminUser) return;

  const orphanTransactions = await prisma.transaction.findMany({ where: { journalEntryId: null }, orderBy: { transactionDate: 'asc' } });
  for (const transaction of orphanTransactions) {
    let journalEntryId: string | null = null;
    const amount = Number(transaction.amount);

    if (transaction.type === 'SALE_REVENUE') {
      journalEntryId = await postSeedJournalEntry({
        entryDate: transaction.transactionDate,
        description: `[Backfill] ${transaction.description ?? transaction.transactionNumber}`,
        referenceType: transaction.referenceType ?? undefined,
        referenceId: transaction.referenceId ?? undefined,
        createdByUserId: transaction.createdByUserId,
        lines: [
          { accountId: arId, debit: amount },
          { accountId: revenueId, credit: amount },
        ],
      });
    } else if (transaction.type === 'PAYMENT_IN') {
      const payment = transaction.referenceId ? await prisma.payment.findUnique({ where: { id: transaction.referenceId } }) : null;
      const cashOrBankId = payment?.method === 'CASH' ? cashId : bankId;
      journalEntryId = await postSeedJournalEntry({
        entryDate: transaction.transactionDate,
        description: `[Backfill] ${transaction.description ?? transaction.transactionNumber}`,
        referenceType: transaction.referenceType ?? undefined,
        referenceId: transaction.referenceId ?? undefined,
        createdByUserId: transaction.createdByUserId,
        lines: [
          { accountId: cashOrBankId, debit: Math.abs(amount) },
          { accountId: arId, credit: Math.abs(amount) },
        ],
      });
    } else if (transaction.type === 'PAYMENT_OUT') {
      const payment = transaction.referenceId ? await prisma.payment.findUnique({ where: { id: transaction.referenceId } }) : null;
      const cashOrBankId = payment?.method === 'CASH' ? cashId : bankId;
      journalEntryId = await postSeedJournalEntry({
        entryDate: transaction.transactionDate,
        description: `[Backfill] ${transaction.description ?? transaction.transactionNumber}`,
        referenceType: transaction.referenceType ?? undefined,
        referenceId: transaction.referenceId ?? undefined,
        createdByUserId: transaction.createdByUserId,
        lines: [
          { accountId: apId, debit: Math.abs(amount) },
          { accountId: cashOrBankId, credit: Math.abs(amount) },
        ],
      });
    } else if (transaction.type === 'REFUND') {
      const payment = transaction.referenceId ? await prisma.payment.findUnique({ where: { id: transaction.referenceId } }) : null;
      const cashOrBankId = payment?.method === 'CASH' ? cashId : bankId;
      journalEntryId = await postSeedJournalEntry({
        entryDate: transaction.transactionDate,
        description: `[Backfill] ${transaction.description ?? transaction.transactionNumber}`,
        referenceType: transaction.referenceType ?? undefined,
        referenceId: transaction.referenceId ?? undefined,
        createdByUserId: transaction.createdByUserId,
        lines: [
          { accountId: arId, debit: Math.abs(amount) },
          { accountId: cashOrBankId, credit: Math.abs(amount) },
        ],
      });
    }

    if (journalEntryId) {
      await prisma.transaction.update({ where: { id: transaction.id }, data: { journalEntryId } });
    }
  }
  console.log(`  -> ${orphanTransactions.length} legacy transactions inspected for backfill`);

  const receivedPurchaseOrders = await prisma.purchaseOrder.findMany({
    where: { status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] } },
    include: { items: true },
  });
  let poBackfillCount = 0;
  for (const po of receivedPurchaseOrders) {
    const alreadyBackfilled = await prisma.journalEntry.findFirst({ where: { referenceType: 'PURCHASE_ORDER', referenceId: po.id } });
    if (alreadyBackfilled) continue;

    const receivedValue = po.items.reduce((sum, item) => {
      const perUnit = Number(item.lineTotal) / Number(item.quantity);
      return sum + perUnit * Number(item.quantityReceived);
    }, 0);
    if (receivedValue <= 0) continue;

    await postSeedJournalEntry({
      entryDate: po.receivedAt ?? po.orderDate,
      description: `[Backfill] Goods received for purchase order ${po.poNumber}`,
      referenceType: 'PURCHASE_ORDER',
      referenceId: po.id,
      createdByUserId: adminUser.id,
      lines: [
        { accountId: inventoryId, debit: receivedValue },
        { accountId: apId, credit: receivedValue },
      ],
    });
    poBackfillCount += 1;
  }
  console.log(`  -> ${poBackfillCount} received purchase orders backfilled`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
