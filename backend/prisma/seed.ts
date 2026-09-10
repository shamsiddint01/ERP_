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

  console.log('Invalidating cached role-permissions (RolePermissionsCacheService)...');
  await flushRolePermissionsCache();

  console.log('Seed complete.');
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
