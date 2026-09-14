interface RoutePermission {
  prefix: string;
  module: string;
  action: string;
}

/**
 * Phase K — "Unauthorized routes should produce a proper access page."
 * Maps a route prefix to the permission that gates it, mirroring exactly
 * what AppLayout's sidebar already uses to decide whether to show the nav
 * link — this is the same list, just consulted before rendering the page
 * behind a direct URL too (typing the URL, a stale bookmark, a shared
 * link), not only when the link itself is clicked.
 *
 * Ordered longest-prefix-first so e.g. "/attendance/student" is matched
 * before the shorter "/attendance". Routes not listed here (Dashboard,
 * Notifications, and self-adapting pages like /education-reports that
 * already hide their own sections per permission) are never blocked at the
 * route level — this is a UX safety net, not the real security boundary;
 * the backend enforces every one of these independently and rejects a
 * request regardless of what the frontend renders.
 */
const ROUTE_PERMISSIONS: RoutePermission[] = [
  { prefix: '/attendance/student', module: 'student_attendance', action: 'VIEW' },
  { prefix: '/finance/accounts', module: 'finance', action: 'VIEW' },
  { prefix: '/finance/reports', module: 'reports', action: 'VIEW' },
  { prefix: '/students', module: 'students', action: 'VIEW' },
  { prefix: '/guardians', module: 'guardians', action: 'VIEW' },
  { prefix: '/leads', module: 'leads', action: 'VIEW' },
  { prefix: '/course-categories', module: 'courses', action: 'VIEW' },
  { prefix: '/courses', module: 'courses', action: 'VIEW' },
  { prefix: '/branches', module: 'branches', action: 'VIEW' },
  { prefix: '/classrooms', module: 'classrooms', action: 'VIEW' },
  { prefix: '/groups', module: 'groups', action: 'VIEW' },
  { prefix: '/enrollments', module: 'enrollments', action: 'VIEW' },
  { prefix: '/schedules', module: 'schedules', action: 'VIEW' },
  { prefix: '/lessons', module: 'lessons', action: 'VIEW' },
  { prefix: '/exams', module: 'exams', action: 'VIEW' },
  { prefix: '/customers', module: 'customers', action: 'VIEW' },
  { prefix: '/orders', module: 'orders', action: 'VIEW' },
  { prefix: '/invoices', module: 'invoices', action: 'VIEW' },
  { prefix: '/tuition', module: 'tuition', action: 'VIEW' },
  { prefix: '/discounts', module: 'discounts', action: 'VIEW' },
  { prefix: '/payments', module: 'payments', action: 'VIEW' },
  { prefix: '/products', module: 'products', action: 'VIEW' },
  { prefix: '/inventory', module: 'inventory', action: 'VIEW' },
  { prefix: '/warehouses', module: 'inventory', action: 'VIEW' },
  { prefix: '/suppliers', module: 'suppliers', action: 'VIEW' },
  { prefix: '/purchases', module: 'purchases', action: 'VIEW' },
  { prefix: '/expenses', module: 'expenses', action: 'VIEW' },
  { prefix: '/employees', module: 'employees', action: 'VIEW' },
  { prefix: '/teachers', module: 'teachers', action: 'VIEW' },
  { prefix: '/departments', module: 'departments', action: 'VIEW' },
  { prefix: '/positions', module: 'positions', action: 'VIEW' },
  { prefix: '/attendance', module: 'attendance', action: 'VIEW' },
  { prefix: '/compensation', module: 'compensation', action: 'VIEW' },
  { prefix: '/payroll', module: 'payroll', action: 'VIEW' },
  { prefix: '/users', module: 'users', action: 'VIEW' },
  { prefix: '/roles', module: 'roles', action: 'VIEW' },
  { prefix: '/audit-log', module: 'audit_logs', action: 'VIEW' },
  { prefix: '/settings', module: 'settings', action: 'VIEW' },
].sort((a, b) => b.prefix.length - a.prefix.length);

export function getRequiredPermission(pathname: string): { module: string; action: string } | null {
  const match = ROUTE_PERMISSIONS.find((route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`));
  return match ? { module: match.module, action: match.action } : null;
}
