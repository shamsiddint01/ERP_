import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationSeverity, NotificationType, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PermissionAction } from '@prisma/client';
import type { PermissionModule } from '../../shared/constants/permission-modules.constant.js';
import type { PaginatedResult } from '../../shared/types/paginated-result.js';
import type { QueryNotificationDto } from './dto/query-notification.dto.js';

const DEFAULT_SEVERITY: Record<NotificationType, NotificationSeverity> = {
  SYSTEM: NotificationSeverity.INFO,
  STUDENT_ABSENT: NotificationSeverity.WARNING,
  STUDENT_LATE: NotificationSeverity.INFO,
  STUDENT_REPEATED_ABSENCE: NotificationSeverity.CRITICAL,
  TUITION_DUE: NotificationSeverity.WARNING,
  TUITION_OVERDUE: NotificationSeverity.CRITICAL,
  TUITION_PAYMENT_RECEIVED: NotificationSeverity.INFO,
  EXAM_UPCOMING: NotificationSeverity.WARNING,
  GRADES_PUBLISHED: NotificationSeverity.INFO,
};

export interface NotifyInput {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  referenceType?: string;
  referenceId?: string;
  actionUrl?: string;
  /**
   * When true (default), skip creating this notification if an *unread* one
   * with the same (recipient, type, referenceId) already exists — so re-runs
   * of a scan or a retried request never pile up duplicates.
   */
  dedupe?: boolean;
}

export type NotifyBroadcastInput = Omit<NotifyInput, 'recipientUserId'>;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  /** Creates one notification for one user. Returns null when deduped away. */
  async notify(input: NotifyInput) {
    if (input.dedupe !== false && input.referenceId) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          recipientUserId: input.recipientUserId,
          type: input.type,
          referenceId: input.referenceId,
          isRead: false,
        },
        select: { id: true },
      });
      if (existing) return null;
    }

    return this.prisma.notification.create({
      data: {
        recipientUserId: input.recipientUserId,
        type: input.type,
        severity: input.severity ?? DEFAULT_SEVERITY[input.type],
        title: input.title,
        message: input.message,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        actionUrl: input.actionUrl,
      },
    });
  }

  /** Fan-out of the same notification to an explicit set of recipients. */
  async notifyUsers(recipientUserIds: string[], base: NotifyBroadcastInput) {
    const unique = [...new Set(recipientUserIds)];
    const results = await Promise.all(unique.map((recipientUserId) => this.notify({ ...base, recipientUserId })));
    return results.filter((r): r is NonNullable<typeof r> => r !== null).length;
  }

  /**
   * Sends a notification to every ACTIVE, non-deleted user whose role grants
   * `module:action`. Best-effort: any failure is logged and swallowed so a
   * notification problem can never break the business operation that triggered
   * it.
   */
  async notifyByPermission(module: PermissionModule, action: PermissionAction, base: NotifyBroadcastInput) {
    try {
      const recipients = await this.resolveRecipientsByPermission(module, action);
      if (recipients.length === 0) return 0;
      return await this.notifyUsers(recipients, base);
    } catch (error) {
      this.logger.error(`notifyByPermission(${module}:${action}) failed: ${(error as Error).message}`);
      return 0;
    }
  }

  private async resolveRecipientsByPermission(module: PermissionModule, action: PermissionAction): Promise<string[]> {
    const roleLinks = await this.prisma.rolePermission.findMany({
      where: { permission: { module, action } },
      select: { roleId: true },
      distinct: ['roleId'],
    });
    if (roleLinks.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { roleId: { in: roleLinks.map((r) => r.roleId) }, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  // ---------------------------------------------------------------------------
  // Read APIs — every query is scoped to the caller's own recipientUserId
  // ---------------------------------------------------------------------------

  async findAll(userId: string, query: QueryNotificationDto): Promise<PaginatedResult<unknown> & { unreadCount: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.NotificationWhereInput = {
      recipientUserId: userId,
      isRead: query.isRead,
      type: query.type,
      ...((query.from || query.to) && {
        createdAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      }),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { recipientUserId: userId, isRead: false } }),
    ]);

    return { items, total, page, pageSize, unreadCount };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({ where: { recipientUserId: userId, isRead: false } });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientUserId: userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    if (result.count === 0) {
      // Either it doesn't exist, isn't ours, or was already read — treat a
      // missing/foreign row as 404, an already-read one as a no-op success.
      const exists = await this.prisma.notification.findFirst({ where: { id, recipientUserId: userId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.findFirst({ where: { id, recipientUserId: userId } });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { recipientUserId: userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const result = await this.prisma.notification.deleteMany({ where: { id, recipientUserId: userId } });
    if (result.count === 0) throw new NotFoundException('Notification not found');
    return { deleted: true };
  }
}
