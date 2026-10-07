import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';

/** A cancelled group is kept this many days (it can still be reopened), then purged. */
export const CANCELLED_GROUP_RETENTION_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Removes groups that have been CANCELLED for CANCELLED_GROUP_RETENTION_DAYS:
 * their schedule, lessons, attendance, homework and exams are deleted, and so
 * are enrollments that never had a tuition charge. Money records are kept —
 * an enrollment with tuition charges (and so the payments allocated to them,
 * which teacher salaries and the cash reports are built on) stays, and the
 * group row then only gets `deletedAt` so it is hidden everywhere instead of
 * being deleted outright.
 */
@Injectable()
export class GroupsCleanupScheduler {
  private readonly logger = new Logger(GroupsCleanupScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup() {
    const purged = await this.purgeExpired();
    if (purged > 0) this.logger.log(`Purged ${purged} group(s) cancelled more than ${CANCELLED_GROUP_RETENTION_DAYS} days ago`);
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - CANCELLED_GROUP_RETENTION_DAYS * DAY_MS);
    const expired = await this.prisma.studentGroup.findMany({
      where: { status: 'CANCELLED', deletedAt: null, cancelledAt: { lte: cutoff } },
      select: { id: true },
    });
    for (const group of expired) await this.purge(group.id);
    return expired.length;
  }

  private async purge(groupId: string) {
    await this.prisma.$transaction(async (tx) => {
      const enrollments = await tx.enrollment.findMany({ where: { groupId }, select: { id: true, _count: { select: { tuitionCharges: true } } } });
      const removableEnrollmentIds = enrollments.filter((e) => e._count.tuitionCharges === 0).map((e) => e.id);

      await tx.studentAttendance.deleteMany({ where: { OR: [{ lesson: { groupId } }, { enrollmentId: { in: removableEnrollmentIds } }] } });
      await tx.homeworkSubmission.deleteMany({ where: { homework: { groupId } } });
      await tx.homework.deleteMany({ where: { groupId } });
      await tx.assessment.deleteMany({ where: { exam: { groupId } } });
      await tx.exam.deleteMany({ where: { groupId } });
      await tx.lesson.deleteMany({ where: { groupId } });
      await tx.schedule.deleteMany({ where: { groupId } });
      // A discount granted for one of these enrollments only — unscoping it would wrongly extend it to the student's other groups.
      await tx.studentDiscount.deleteMany({ where: { enrollmentId: { in: removableEnrollmentIds } } });
      await tx.enrollment.deleteMany({ where: { id: { in: removableEnrollmentIds } } });

      if (removableEnrollmentIds.length === enrollments.length) {
        await tx.studentGroup.delete({ where: { id: groupId } });
      } else {
        await tx.studentGroup.update({ where: { id: groupId }, data: { deletedAt: new Date() } });
      }
    });
  }
}
