import { Module } from '@nestjs/common';
import { ExtraLessonsController } from './extra-lessons.controller.js';
import { ExtraLessonsService } from './extra-lessons.service.js';

@Module({
  controllers: [ExtraLessonsController],
  providers: [ExtraLessonsService],
  exports: [ExtraLessonsService],
})
export class ExtraLessonsModule {}
