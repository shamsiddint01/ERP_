import { Controller, Get, Query, Res } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { TuitionReportQueryDto } from './dto/tuition-report-query.dto.js';
import { toCsv } from './report-export.util.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ---------------------------------------------------------------------------
  // Phase G — Tuition reports
  // ---------------------------------------------------------------------------

  @Get('tuition-billed')
  @RequirePermission('reports', PermissionAction.VIEW)
  async tuitionBilled(@Query() query: TuitionReportQueryDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.reportsService.tuitionBilled(query);
    if (format === 'csv') return this.sendCsv(res, 'tuition-billed', report.rows);
    return res.json(report);
  }

  @Get('tuition-collected')
  @RequirePermission('reports', PermissionAction.VIEW)
  async tuitionCollected(@Query() query: TuitionReportQueryDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.reportsService.tuitionCollected(query);
    if (format === 'csv') return this.sendCsv(res, 'tuition-collected', report.rows);
    return res.json(report);
  }

  @Get('tuition-outstanding')
  @RequirePermission('reports', PermissionAction.VIEW)
  async tuitionOutstanding(@Query() query: TuitionReportQueryDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.reportsService.tuitionOutstanding(query);
    if (format === 'csv') return this.sendCsv(res, 'tuition-outstanding', report.rows);
    return res.json(report);
  }

  @Get('tuition-overdue')
  @RequirePermission('reports', PermissionAction.VIEW)
  async tuitionOverdue(@Query() query: TuitionReportQueryDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.reportsService.tuitionOverdue(query);
    if (format === 'csv') return this.sendCsv(res, 'tuition-overdue', report.rows);
    return res.json(report);
  }

  @Get('tuition-collection-rate')
  @RequirePermission('reports', PermissionAction.VIEW)
  async tuitionCollectionRate(@Query() query: TuitionReportQueryDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.reportsService.tuitionCollectionRate(query);
    if (format === 'csv') return this.sendCsv(res, 'tuition-collection-rate', report.rows);
    return res.json(report);
  }

  @Get('student-debt')
  @RequirePermission('reports', PermissionAction.VIEW)
  async studentDebtReport(@Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.reportsService.studentDebtReport();
    if (format === 'csv') return this.sendCsv(res, 'student-debt', report.rows);
    return res.json(report);
  }

  private sendCsv(res: Response, name: string, rows: Record<string, unknown>[]) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    return res.send(toCsv(rows));
  }
}
