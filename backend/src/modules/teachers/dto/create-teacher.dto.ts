import { TeacherProfileStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateTeacherDto {
  @IsUUID()
  employeeId!: string;

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
