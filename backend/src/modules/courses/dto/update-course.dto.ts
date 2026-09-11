import { CourseLevel, CourseStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdateCourseDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationWeeks?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  lessonDurationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultTuition?: number;

  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;
}
