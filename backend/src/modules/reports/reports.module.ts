import { Module } from '@nestjs/common';
import { CompensationModule } from '../compensation/compensation.module.js';
import { ExamsModule } from '../exams/exams.module.js';
import { EducationReportsController } from './education-reports.controller.js';
import { EducationReportsService } from './education-reports.service.js';
import { ReportPdfService } from './report-pdf.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [ExamsModule, CompensationModule],
  controllers: [ReportsController, EducationReportsController],
  providers: [ReportsService, ReportPdfService, EducationReportsService],
  exports: [ReportsService, EducationReportsService],
})
export class ReportsModule {}
