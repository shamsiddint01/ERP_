import { IsISO8601, IsOptional, IsString } from 'class-validator';

/**
 * Deliberately excludes amount/discountAmount/netAmount — those are frozen
 * at creation and immutable afterward (see TuitionCharge's own doc comment:
 * a genuine correction cancels this charge and bills a new one, rather than
 * silently rewriting posted financial history). Only the administrative
 * fields are editable here.
 */
export class UpdateTuitionChargeDto {
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
