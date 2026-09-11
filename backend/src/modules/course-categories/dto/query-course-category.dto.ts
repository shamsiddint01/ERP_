import { CourseCategoryStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryCourseCategoryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CourseCategoryStatus)
  status?: CourseCategoryStatus;
}
