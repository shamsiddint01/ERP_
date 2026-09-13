import { Module } from '@nestjs/common';
import { StudentAttendanceModule } from '../student-attendance/student-attendance.module.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';

@Module({
  imports: [StudentAttendanceModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
