import { Module } from '@nestjs/common';
import { LessonGenerationService } from './lesson-generation.service.js';
import { SchedulesController } from './schedules.controller.js';
import { SchedulesService } from './schedules.service.js';

@Module({
  controllers: [SchedulesController],
  providers: [SchedulesService, LessonGenerationService],
  exports: [SchedulesService, LessonGenerationService],
})
export class SchedulesModule {}
