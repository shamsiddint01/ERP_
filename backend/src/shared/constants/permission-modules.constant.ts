import { PermissionAction } from '@prisma/client';

/**
 * Every module that can appear in the RBAC matrix, and which actions are
 * actually meaningful for it. Drives both the permission seed and the
 * admin Roles & Permissions matrix UI — the two must never drift apart,
 * so both read from this single source.
 */
export const PERMISSION_MODULES = {
  users: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  roles: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  customers: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  products: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  inventory: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
  suppliers: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  purchases: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.APPROVE, PermissionAction.EXPORT],
  orders: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.APPROVE, PermissionAction.EXPORT],
  invoices: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.APPROVE, PermissionAction.EXPORT],
  payments: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
  finance: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
  expenses: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.APPROVE, PermissionAction.EXPORT],
  employees: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  attendance: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.EXPORT],
  reports: [PermissionAction.VIEW, PermissionAction.EXPORT],
  notifications: [PermissionAction.VIEW],
  audit_logs: [PermissionAction.VIEW, PermissionAction.EXPORT],
  settings: [PermissionAction.VIEW, PermissionAction.EDIT],
} as const satisfies Record<string, PermissionAction[]>;

export type PermissionModule = keyof typeof PERMISSION_MODULES;

export function permissionKey(module: string, action: PermissionAction): string {
  return `${module}:${action}`;
}
