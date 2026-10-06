interface RoutePermission {
  prefix: string;
  module: string;
  action: string;
}

/**
 * Maps a route prefix to the permission that gates it, mirroring what
 * AppLayout's sidebar uses to decide whether to show the link — consulted
 * before rendering the page behind a direct URL too (a typed URL, a stale
 * bookmark, a shared link). Tabbed sections (/attendance, /payments) and self-adapting pages (Dashboard, /reports, Notifications)
 * gate themselves per tab/section instead, so they're not listed here. This
 * is a UX safety net, not the security boundary — the backend enforces every
 * one of these independently.
 *
 * Ordered longest-prefix-first.
 */
const ROUTE_PERMISSIONS: RoutePermission[] = [
  { prefix: '/students', module: 'students', action: 'VIEW' },
  { prefix: '/teachers', module: 'teachers', action: 'VIEW' },
  { prefix: '/groups', module: 'groups', action: 'VIEW' },
  { prefix: '/enrollments', module: 'enrollments', action: 'VIEW' },
  { prefix: '/lessons', module: 'lessons', action: 'VIEW' },
  { prefix: '/tuition', module: 'tuition', action: 'VIEW' },
  { prefix: '/exams', module: 'exams', action: 'VIEW' },
  { prefix: '/courses', module: 'courses', action: 'VIEW' },
  { prefix: '/branches', module: 'branches', action: 'VIEW' },
  { prefix: '/classrooms', module: 'classrooms', action: 'VIEW' },
  { prefix: '/settings', module: 'settings', action: 'VIEW' },
].sort((a, b) => b.prefix.length - a.prefix.length);

export function getRequiredPermission(pathname: string): { module: string; action: string } | null {
  const match = ROUTE_PERMISSIONS.find((route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`));
  return match ? { module: match.module, action: match.action } : null;
}
