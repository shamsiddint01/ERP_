import { IsOptional, IsString } from 'class-validator';

/** baseSalary/salaryType/overtimeRate/effectiveFrom are immutable once created — history is preserved by
 *  creating a new compensation record (which closes out the previous one), never by editing an old one. */
export class UpdateCompensationDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
