import { ExamStatus, ExamType } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryExamDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  teacherEmployeeId?: string;

  @IsOptional()
  @IsEnum(ExamStatus)
  status?: ExamStatus;

  @IsOptional()
  @IsEnum(ExamType)
  type?: ExamType;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
