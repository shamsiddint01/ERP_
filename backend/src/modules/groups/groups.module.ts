import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module.js';
import { StudentAttendanceModule } from '../student-attendance/student-attendance.module.js';
import { GroupsCleanupScheduler } from './groups-cleanup.scheduler.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';

@Module({
  imports: [StudentAttendanceModule, ExamsModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupsCleanupScheduler],
  exports: [GroupsService],
})
export class GroupsModule {}
