import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryHomeworkDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  groupId?: string;
}
