import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Resolves the acting user's own teacherEmployeeId if — and only if — they
 * genuinely ARE a teacher (their linked Employee has an ACTIVE
 * TeacherProfile). Returns null for everyone else (managers, admins,
 * reception, accountants, or a user with no linked Employee at all), who are
 * never scoped by this mechanism — RBAC permissions alone govern them.
 * Mirrors StudentAttendanceService.resolveTeacherScope (Phase F) exactly;
 * duplicated rather than imported since that service doesn't export it and
 * the two modules are otherwise independent.
 */
export async function resolveTeacherScope(prisma: PrismaService, userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
  if (!user?.employeeId) return null;
  const profile = await prisma.teacherProfile.findUnique({ where: { employeeId: user.employeeId }, select: { status: true } });
  if (!profile || profile.status !== 'ACTIVE') return null;
  return user.employeeId;
}

/** Specific-record actions reject a foreign group/exam outright, rather than silently narrowing like list views do. */
export async function assertTeacherScopeAllows(prisma: PrismaService, userId: string, ownerTeacherEmployeeId: string | null): Promise<void> {
  const teacherScope = await resolveTeacherScope(prisma, userId);
  if (!teacherScope) return;
  if (ownerTeacherEmployeeId !== teacherScope) {
    throw new ForbiddenException('You can only manage exams/assessments for groups you teach');
  }
}
