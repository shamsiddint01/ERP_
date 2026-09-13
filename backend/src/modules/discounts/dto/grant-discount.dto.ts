import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

/** Grants an existing Discount catalog entry to one student — enrollmentId scopes it to a single enrollment; omitted, it applies to every enrollment that student has. */
export class GrantDiscountDto {
  @IsUUID()
  discountId!: string;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsISO8601()
  startDate!: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
