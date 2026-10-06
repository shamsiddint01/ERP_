import { ExtraLessonStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto.js';

export class QueryExtraLessonDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ExtraLessonStatus)
  status?: ExtraLessonStatus;

  /** true = only lessons that haven't started yet. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  upcoming?: boolean;
}
