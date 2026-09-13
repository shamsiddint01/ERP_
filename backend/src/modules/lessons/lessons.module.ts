import { Module } from '@nestjs/common';
import { StudentAttendanceModule } from '../student-attendance/student-attendance.module.js';
import { LessonsController } from './lessons.controller.js';
import { LessonsService } from './lessons.service.js';

@Module({
  imports: [StudentAttendanceModule],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
