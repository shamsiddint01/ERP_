import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';

export interface ScanSummary {
  tuitionDue: number;
  overdueTuition: number;
  upcomingExams: number;
}

/** Tuition due within this many days triggers a reminder (once — dedupe keeps it from repeating every day until read). */
const TUITION_DUE_REMINDER_DAYS = 3;

/** A SCHEDULED exam within this many days triggers one reminder (dedupe keeps it from repeating). */
const EXAM_UPCOMING_REMINDER_DAYS = 3;

/**
 * Daily backstop for the notifications that aren't tied to a single state
 * transition. Immediate events (payment received, attendance flagged) are
 * notified inline by their own services; this catches the time-based ones
 * (tuition quietly going overdue, an exam coming up) and anything the inline
 * path missed. Every write goes through NotificationsService.notify()
 * with dedupe on, so running twice in a day is harmless.
 */
@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async handleDailyScans() {
    const summary = await this.runDailyScans();
    this.logger.log(
      `Daily notification scan: ${summary.tuitionDue} tuition due soon, ${summary.overdueTuition} overdue tuition, ` +
        `${summary.upcomingExams} upcoming exams`,
    );
  }

  async runDailyScans(): Promise<ScanSummary> {
    const [tuitionDue, overdueTuition, upcomingExams] = await Promise.all([
      this.scanTuitionDue(),
      this.scanOverdueTuition(),
      this.scanUpcomingExams(),
    ]);
    return { tuitionDue, overdueTuition, upcomingExams };
  }

  /** PENDING/PARTIALLY_PAID tuition charges due within TUITION_DUE_REMINDER_DAYS — a one-time-per-charge reminder (dedupe: same recipient/type/referenceId, unread). */
  private async scanTuitionDue(): Promise<number> {
    const now = new Date();
    const horizon = new Date(now.getTime() + TUITION_DUE_REMINDER_DAYS * 24 * 60 * 60 * 1000);
    const charges = await this.prisma.tuitionCharge.findMany({
      where: { status: { in: ['PENDING', 'PARTIALLY_PAID'] }, dueDate: { gte: now, lte: horizon } },
      select: { id: true, billingPeriod: true, netAmount: true, dueDate: true, student: { select: { fullName: true } } },
    });

    let notified = 0;
    for (const charge of charges) {
      notified += await this.notifications.notifyByPermission('tuition', 'VIEW', {
        type: 'TUITION_DUE',
        title: "To'lov muddati yaqinlashmoqda",
        message: `${charge.student.fullName} — ${charge.billingPeriod} uchun ${Number(charge.netAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}, muddati ${charge.dueDate.toISOString().slice(0, 10)}.`,
        referenceType: 'TuitionCharge',
        referenceId: charge.id,
        actionUrl: '/payments?tab=charges',
      });
    }
    return notified;
  }

  /** PENDING/PARTIALLY_PAID/OVERDUE tuition charges past their due date — flips status to OVERDUE and notifies (mirrors scanOverdueInvoices exactly). */
  private async scanOverdueTuition(): Promise<number> {
    const now = new Date();
    const charges = await this.prisma.tuitionCharge.findMany({
      where: { dueDate: { lt: now }, status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: {
        id: true,
        billingPeriod: true,
        netAmount: true,
        dueDate: true,
        status: true,
        student: { select: { fullName: true } },
        allocations: { select: { amount: true } },
      },
    });

    let notified = 0;
    for (const charge of charges) {
      if (charge.status !== 'OVERDUE') {
        await this.prisma.tuitionCharge.updateMany({ where: { id: charge.id, status: charge.status }, data: { status: 'OVERDUE' } });
      }
      const allocated = charge.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
      const outstanding = Number(charge.netAmount) - allocated;
      notified += await this.notifications.notifyByPermission('tuition', 'VIEW', {
        type: 'TUITION_OVERDUE',
        severity: 'CRITICAL',
        title: "Muddati o'tgan to'lov",
        message: `${charge.student.fullName} — ${charge.billingPeriod} uchun ${outstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}, muddati ${charge.dueDate.toISOString().slice(0, 10)} edi.`,
        referenceType: 'TuitionCharge',
        referenceId: charge.id,
        actionUrl: '/payments?tab=charges',
      });
    }
    return notified;
  }

  /** SCHEDULED exams within EXAM_UPCOMING_REMINDER_DAYS — a one-time-per-exam reminder (dedupe: same recipient/type/referenceId, unread), matching scanTuitionDue's pattern exactly. */
  private async scanUpcomingExams(): Promise<number> {
    const now = new Date();
    const horizon = new Date(now.getTime() + EXAM_UPCOMING_REMINDER_DAYS * 24 * 60 * 60 * 1000);
    const exams = await this.prisma.exam.findMany({
      where: { status: 'SCHEDULED', date: { gte: now, lte: horizon } },
      select: { id: true, title: true, date: true, group: { select: { name: true } } },
    });

    let notified = 0;
    for (const exam of exams) {
      notified += await this.notifications.notifyByPermission('exams', 'VIEW', {
        type: 'EXAM_UPCOMING',
        title: 'Yaqinlashib kelayotgan imtihon',
        message: `${exam.title} — ${exam.group.name} guruhida ${exam.date.toISOString().slice(0, 10)} kuni bo'lib o'tadi.`,
        referenceType: 'Exam',
        referenceId: exam.id,
        actionUrl: `/exams/${exam.id}`,
      });
    }
    return notified;
  }
}
