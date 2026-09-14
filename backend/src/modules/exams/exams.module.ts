import { Module } from '@nestjs/common';
import { GradingScaleService } from '../../shared/grading/grading-scale.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StudentAttendanceModule } from '../student-attendance/student-attendance.module.js';
import { AcademicProgressService } from './academic-progress.service.js';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { ExamsController } from './exams.controller.js';
import { ExamsService } from './exams.service.js';

@Module({
  imports: [NotificationsModule, StudentAttendanceModule],
  controllers: [ExamsController, AssessmentsController],
  providers: [ExamsService, AssessmentsService, AcademicProgressService, GradingScaleService],
  exports: [ExamsService, AssessmentsService, AcademicProgressService],
})
export class ExamsModule {}
