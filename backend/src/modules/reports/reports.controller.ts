import { Controller, Get, Query, Res } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { ReportDateRangeDto } from './dto/report-date-range.dto.js';
import { TuitionReportQueryDto } from './dto/tuition-report-query.dto.js';
import { toCsv } from './report-export.util.js';
import { ReportPdfService } from './report-pdf.service.js';
import { ReportsService } from './reports.service.js';

const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2 });

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportPdfService: ReportPdfService,
  ) {}

  @Get('general-ledger')
  @RequirePermission('reports', PermissionAction.VIEW)
  async generalLedger(@Query() query: ReportDateRangeDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.reportsService.generalLedger(query);
    if (format === 'csv') return this.sendCsv(res, 'general-ledger', report.rows);
    return res.json(report);
  }

  @Get('trial-balance')
  @RequirePermission('reports', PermissionAction.VIEW)
  async trialBalance(@Query() query: ReportDateRangeDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.reportsService.trialBalance(query);
    if (format === 'csv') return this.sendCsv(res, 'trial-balance', report.rows);
    if (format === 'pdf') {
      const buffer = await this.reportPdfService.generateTabular(
        'Trial Balance',
        `As of ${report.asOf.toISOString().slice(0, 10)}`,
        [
          { key: 'code', label: 'Code', width: 60 },
          { key: 'name', label: 'Account', width: 260 },
          { key: 'debit', label: 'Debit', width: 100, align: 'right' },
          { key: 'credit', label: 'Credit', width: 100, align: 'right' },
        ],
        report.rows.map((r) => ({ code: r.code, name: r.name, debit: r.debit ? money(r.debit) : '', credit: r.credit ? money(r.credit) : '' })),
        [
          { label: 'Total Debit', value: money(report.totalDebit) },
          { label: 'Total Credit', value: money(report.totalCredit) },
        ],
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="trial-balance.pdf"');
      return res.send(buffer);
    }
    return res.json(report);
  }

  @Get('profit-and-loss')
  @RequirePermission('reports', PermissionAction.VIEW)
  async profitAndLoss(@Query() query: ReportDateRangeDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.reportsService.profitAndLoss(query);
    if (format === 'csv') return this.sendCsv(res, 'profit-and-loss', [...report.revenueLines, ...report.expenseLines]);
    if (format === 'pdf') {
      const rows = [
        ...report.revenueLines.map((l) => ({ code: l.code, name: l.name, amount: money(l.amount) })),
        { code: '', name: 'Total Revenue', amount: money(report.totalRevenue) },
        ...report.expenseLines.map((l) => ({ code: l.code, name: l.name, amount: money(l.amount) })),
        { code: '', name: 'Total Expense', amount: money(report.totalExpense) },
      ];
      const buffer = await this.reportPdfService.generateTabular(
        'Profit & Loss',
        `${report.from ?? 'Inception'} — ${report.to}`,
        [
          { key: 'code', label: 'Code', width: 60 },
          { key: 'name', label: 'Account', width: 260 },
          { key: 'amount', label: 'Amount', width: 100, align: 'right' },
        ],
        rows,
        [{ label: 'Net Income', value: money(report.netIncome) }],
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="profit-and-loss.pdf"');
      return res.send(buffer);
    }
    return res.json(report);
  }

  @Get('balance-sheet')
  @RequirePermission('reports', PermissionAction.VIEW)
  async balanceSheet(@Query() query: ReportDateRangeDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.reportsService.balanceSheet(query);
    if (format === 'csv') return this.sendCsv(res, 'balance-sheet', [...report.assetLines, ...report.liabilityLines, ...report.equityLines]);
    return res.json(report);
  }

  @Get('cash-flow')
  @RequirePermission('reports', PermissionAction.VIEW)
  async cashFlow(@Query() query: ReportDateRangeDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.reportsService.cashFlow(query);
    if (format === 'csv') return this.sendCsv(res, 'cash-flow', report.entries);
    return res.json(report);
  }

  @Get('ar-reconciliation')
  @RequirePermission('reports', PermissionAction.VIEW)
  arReconciliation() {
    return this.reportsService.arReconciliation();
  }

  @Get('ap-reconciliation')
  @RequirePermission('reports', PermissionAction.VIEW)
  apReconciliation() {
    return this.reportsService.apReconciliation();
  }

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
