import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StudentAttendanceController } from './student-attendance.controller.js';
import { StudentAttendanceService } from './student-attendance.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [StudentAttendanceController],
  providers: [StudentAttendanceService],
  exports: [StudentAttendanceService],
})
export class StudentAttendanceModule {}
