import { Module } from '@nestjs/common';
import { StudentAttendanceModule } from '../student-attendance/student-attendance.module.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [StudentAttendanceModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
