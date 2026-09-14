import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateAssessmentDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  score?: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
