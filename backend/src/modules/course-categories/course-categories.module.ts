import { Module } from '@nestjs/common';
import { CourseCategoriesController } from './course-categories.controller.js';
import { CourseCategoriesService } from './course-categories.service.js';

@Module({
  controllers: [CourseCategoriesController],
  providers: [CourseCategoriesService],
  exports: [CourseCategoriesService],
})
export class CourseCategoriesModule {}
