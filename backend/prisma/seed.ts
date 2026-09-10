import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, PermissionAction, type AccountCategory, type AccountType, type TransactionReferenceType } from '@prisma/client';
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

  const courseDefs = [
    { code: 'ENG-GEN', name: 'General English', categoryId: languages.id, level: 'ELEMENTARY' as const, defaultTuition: '600000', durationWeeks: 12 },
    { code: 'IELTS', name: 'IELTS Preparation', categoryId: languages.id, level: 'UPPER_INTERMEDIATE' as const, defaultTuition: '900000', durationWeeks: 10 },
    { code: 'PY-BASE', name: 'Python Basics', categoryId: stem.id, level: 'BEGINNER' as const, defaultTuition: '750000', durationWeeks: 16 },
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
    { code: 'ENG-A1-01', name: 'English A1 — Evening', courseCode: 'ENG-GEN', level: 'ELEMENTARY' as const, tuition: '600000', start: '2026-09-01' },
    { code: 'IELTS-01', name: 'IELTS Intensive', courseCode: 'IELTS', level: 'UPPER_INTERMEDIATE' as const, tuition: '900000', start: '2026-09-15' },
  ];
  const groupsByCode: Record<string, { id: string }> = {};
  for (const g of groupDefs) {
    groupsByCode[g.code] = await prisma.studentGroup.upsert({
      where: { code: g.code },
      create: {
        code: g.code,
        name: g.name,
        courseId: coursesByCode[g.courseCode].id,
        branchId: branch.id,
        classroomId: room101.id,
        capacity: 12,
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
    { phone: '+998907776655', fullName: 'Karim Karimov', rel: 'FATHER' as const, studentCode: 'STU-000001' },
    { phone: '+998907776656', fullName: 'Nodira Yusupova', rel: 'MOTHER' as const, studentCode: 'STU-000002' },
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
      create: { studentId: studentsByCode[gd.studentCode].id, guardianId: guardian.id, relationship: gd.rel, isPrimary: true },
      update: {},
    });
  }

  // Enrollments — key on (studentId, groupId, ACTIVE) via findFirst; a student
  // may historically re-enrol, so no unique constraint, just a dedupe here.
  const enrollmentDefs = [
    { studentCode: 'STU-000001', groupCode: 'ENG-A1-01', tuition: '600000' },
    { studentCode: 'STU-000002', groupCode: 'IELTS-01', tuition: '900000' },
  ];
  for (const e of enrollmentDefs) {
    const studentId = studentsByCode[e.studentCode].id;
    const groupId = groupsByCode[e.groupCode].id;
    const existing = await prisma.enrollment.findFirst({ where: { studentId, groupId, status: 'ACTIVE' } });
    if (!existing) {
      await prisma.enrollment.create({
        data: { studentId, groupId, startDate: new Date('2026-09-01'), status: 'ACTIVE', agreedTuition: e.tuition },
      });
    }
  }

  const leadDefs = [
    { fullName: 'Jasur Toshpulatov', phone: '+998935550011', preferredCourse: 'PY-BASE', source: 'INSTAGRAM', status: 'NEW' as const },
    { fullName: 'Dilnoza Rashidova', phone: '+998935550012', preferredCourse: 'IELTS', source: 'REFERRAL', status: 'CONTACTED' as const },
  ];
  for (const l of leadDefs) {
    const existing = await prisma.lead.findFirst({ where: { phone: l.phone, fullName: l.fullName } });
    if (!existing) {
      await prisma.lead.create({
        data: {
          fullName: l.fullName,
          phone: l.phone,
          preferredCourseId: coursesByCode[l.preferredCourse].id,
          preferredBranchId: branch.id,
          source: l.source,
          status: l.status,
        },
      });
    }
  }

  console.log('  -> 1 branch, 2 classrooms, 2 course categories, 3 courses, 2 groups, 2 students, 2 guardians, 2 enrollments, 2 leads ensured');
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
