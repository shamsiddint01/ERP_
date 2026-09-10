import { Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { QueryNotificationDto } from './dto/query-notification.dto.js';
import { NotificationsScheduler } from './notifications.scheduler.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly scheduler: NotificationsScheduler,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryNotificationDto) {
    return this.notificationsService.findAll(user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.markRead(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.remove(user.id, id);
  }

  /**
   * Ops/admin hook to run the daily digest scans on demand (low-stock,
   * overdue invoices, stale approvals). The cron runs these automatically;
   * this endpoint is for verification and for wiring an external scheduler.
   */
  @Post('scan')
  @RequirePermission('settings', PermissionAction.EDIT)
  runScans() {
    return this.scheduler.runDailyScans();
  }
}
