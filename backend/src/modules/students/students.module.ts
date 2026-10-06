import { Module } from '@nestjs/common';
import { DiscountsModule } from '../discounts/discounts.module.js';
import { ExamsModule } from '../exams/exams.module.js';
import { StudentAttendanceModule } from '../student-attendance/student-attendance.module.js';
import { TuitionModule } from '../tuition/tuition.module.js';
import { StudentsController } from './students.controller.js';
import { StudentAccountService } from './student-account.service.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [StudentAttendanceModule, TuitionModule, DiscountsModule, ExamsModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentAccountService],
  exports: [StudentsService],
})
export class StudentsModule {}
