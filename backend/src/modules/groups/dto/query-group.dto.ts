import { CourseLevel, StudentGroupStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryGroupDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  teacherEmployeeId?: string;

  @IsOptional()
  @IsEnum(StudentGroupStatus)
  status?: StudentGroupStatus;

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @IsOptional()
  @IsISO8601()
  startFrom?: string;

  @IsOptional()
  @IsISO8601()
  startTo?: string;
}
