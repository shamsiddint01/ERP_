import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { DashboardService } from './dashboard.service.js';

/**
 * No @RequirePermission anywhere here, deliberately — every authenticated
 * user has a dashboard, just a different one. Each method internally
 * includes only the sections the caller's own permissions cover (see
 * DashboardService's class doc comment for the full rationale).
 */
@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getOverview(user.id);
  }

  @Get('charts')
  getCharts(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getCharts(user.id);
  }

  @Get('today')
  getToday(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getToday(user.id);
  }
}
