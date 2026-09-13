import { Module } from '@nestjs/common';
import { DiscountsModule } from '../discounts/discounts.module.js';
import { StudentAttendanceModule } from '../student-attendance/student-attendance.module.js';
import { TuitionModule } from '../tuition/tuition.module.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [StudentAttendanceModule, TuitionModule, DiscountsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
