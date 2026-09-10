import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryCompensationDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
