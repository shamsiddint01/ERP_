import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class GradeSubmissionDto {
  /** Checked against the homework's own maxScore in the service. */
  @IsInt()
  @Min(0)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;
}
