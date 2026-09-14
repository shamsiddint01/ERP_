import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateAssessmentDto {
  @IsUUID()
  studentId!: string;

  /** Bounds (>= 0, <= exam.maxScore) are enforced in AssessmentsService, where exam.maxScore is known — not expressible as a static decorator here. */
  @IsNumber()
  @Min(0)
  score!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
