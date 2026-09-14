import { ExamStatus, ExamType } from '@prisma/client';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

/**
 * Deliberately allows editing maxScore/passingScore even after assessments
 * exist — unlike Phase G's TuitionCharge (which freezes money fields to
 * protect a discount computation already baked into netAmount), an exam's
 * score/grade is recomputed from the CURRENT maxScore whenever an
 * Assessment is created or updated, so there's no "historical value" to
 * protect here. Changing maxScore does NOT retroactively recompute existing
 * assessments' percentage/grade (see AssessmentsService), matching "Do not
 * change historical charges silently" in spirit — a correction to an old
 * assessment is a deliberate PATCH /assessments/:id, never automatic.
 */
export class UpdateExamDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsUUID()
  teacherEmployeeId?: string;

  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  passingScore?: number;

  @IsOptional()
  @IsEnum(ExamType)
  type?: ExamType;

  @IsOptional()
  @IsEnum(ExamStatus)
  status?: ExamStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
