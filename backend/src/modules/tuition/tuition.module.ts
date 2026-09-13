import { Module } from '@nestjs/common';
import { StudentFinanceService } from './student-finance.service.js';
import { TuitionAllocationService } from './tuition-allocation.service.js';
import { TuitionChargeService } from './tuition-charge.service.js';
import { TuitionController } from './tuition.controller.js';

@Module({
  controllers: [TuitionController],
  providers: [TuitionChargeService, TuitionAllocationService, StudentFinanceService],
  exports: [TuitionChargeService, TuitionAllocationService, StudentFinanceService],
})
export class TuitionModule {}
