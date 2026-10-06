import { ExtraLessonStatus } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateExtraLessonDto } from './create-extra-lesson.dto.js';

export class UpdateExtraLessonDto extends PartialType(CreateExtraLessonDto) {
  @IsOptional()
  @IsEnum(ExtraLessonStatus)
  status?: ExtraLessonStatus;
}
