import { TeacherProfileStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** employeeId is intentionally absent — a profile's anchor employee never changes after creation (deactivate and create a new one instead). */
export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  experienceYears?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perLessonRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perGroupRate?: number;

  @IsOptional()
  @IsEnum(TeacherProfileStatus)
  status?: TeacherProfileStatus;
}
