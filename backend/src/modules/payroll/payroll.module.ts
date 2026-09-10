import { Module } from '@nestjs/common';
import { PayrollComponentsController } from './payroll-components.controller.js';
import { PayrollComponentsService } from './payroll-components.service.js';
import { PayrollPeriodsController } from './payroll-periods.controller.js';
import { PayrollPeriodsService } from './payroll-periods.service.js';
import { PayrollReportsService } from './payroll-reports.service.js';
import { PayrollCalculationService } from './payroll-calculation.service.js';
import { PayrollController } from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';

@Module({
  controllers: [PayrollController, PayrollPeriodsController, PayrollComponentsController],
  providers: [PayrollService, PayrollPeriodsService, PayrollComponentsService, PayrollCalculationService, PayrollReportsService],
  exports: [PayrollService, PayrollPeriodsService, PayrollComponentsService],
})
export class PayrollModule {}
