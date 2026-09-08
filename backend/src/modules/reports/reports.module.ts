import { Module } from '@nestjs/common';
import { ReportPdfService } from './report-pdf.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportPdfService],
})
export class ReportsModule {}
