import { CourseLevel, StudentGroupStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsUUID()
  courseId!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  teacherEmployeeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tuitionAmount?: number;

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @IsISO8601()
  startDate!: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsEnum(StudentGroupStatus)
  status?: StudentGroupStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
