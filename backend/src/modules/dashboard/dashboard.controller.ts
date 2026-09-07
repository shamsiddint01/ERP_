import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('revenue-chart')
  getRevenueChart(@Query('days') days?: string) {
    return this.dashboardService.getRevenueChart(days ? Number(days) : undefined);
  }
}
