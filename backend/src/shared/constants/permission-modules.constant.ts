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
  payments: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
  reports: [PermissionAction.VIEW, PermissionAction.EXPORT],
  notifications: [PermissionAction.VIEW],
  audit_logs: [PermissionAction.VIEW, PermissionAction.EXPORT],
  settings: [PermissionAction.VIEW, PermissionAction.EDIT],

  // Education center domain (Phase A). CRUD modules are wired in their own
  // phases; the permission keys are registered now so the RBAC matrix and
  // seed stay a single source of truth as those modules land.
  students: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  courses: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  groups: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  enrollments: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  branches: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  classrooms: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  // Phase D — no dedicated permission existed for teaching staff specifically
  // (as opposed to `employees`, the general HR record), so one is added here.
  teachers: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  // Phase E — spec calls for exactly these four actions (no EXPORT).
  schedules: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  lessons: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  // Phase F — DELETE is a genuine hard delete here (correcting a mistaken
  // mark), unlike most modules above; EXPORT backs the CSV report download.
  student_attendance: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  // Phase G — DELETE is deliberately absent: a TuitionCharge is never
  // deleted, only cancelled via its own guarded action endpoint (APPROVE
  // gates that cancellation, mirroring purchases/orders' own APPROVE-gated
  // workflow actions).
  tuition: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE, PermissionAction.EXPORT],
  discounts: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  // Phase H — `exams` gates the Exam entity itself (schedule/metadata);
  // `grades` separately gates Assessment create/update/delete, so a role can
  // see that an exam exists without being able to touch scores (Accountant:
  // "no grade editing") or the reverse split isn't needed anywhere here.
  exams: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.EXPORT],
  grades: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  // Student portal — `homework` and `extra_lessons` gate the staff side
  // (teachers assign/grade homework, the center schedules extra lessons);
  // `student_portal` gates the /portal/* endpoints a logged-in student uses,
  // which additionally require the user to be linked to a Student record.
  homework: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  extra_lessons: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  student_portal: [PermissionAction.VIEW],
} as const satisfies Record<string, PermissionAction[]>;

export type PermissionModule = keyof typeof PERMISSION_MODULES;

export function permissionKey(module: string, action: PermissionAction): string {
  return `${module}:${action}`;
}
