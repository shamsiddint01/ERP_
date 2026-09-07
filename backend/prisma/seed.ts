import { PrismaClient, PermissionAction } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PERMISSION_MODULES } from '../src/shared/constants/permission-modules.constant.js';

const prisma = new PrismaClient();

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
      employees: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
      attendance: [PermissionAction.VIEW, PermissionAction.EXPORT],
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

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
