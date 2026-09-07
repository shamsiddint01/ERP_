import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsOptional, ValidateNested } from 'class-validator';
import { InvoiceItemDto } from './create-invoice.dto.js';

export class UpdateInvoiceDto {
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];
}
