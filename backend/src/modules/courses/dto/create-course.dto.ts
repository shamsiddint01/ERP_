import { CourseLevel, CourseStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateCourseDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsString()
  name!: string;

  @IsString()
  code!: string;

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
