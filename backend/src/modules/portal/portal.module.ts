import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module.js';
import { StudentAttendanceModule } from '../student-attendance/student-attendance.module.js';
import { TuitionModule } from '../tuition/tuition.module.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

@Module({
  imports: [TuitionModule, ExamsModule, StudentAttendanceModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
