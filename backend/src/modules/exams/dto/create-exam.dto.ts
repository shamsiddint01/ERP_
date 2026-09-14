import { ExamType } from '@prisma/client';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

export class CreateExamDto {
  @IsString()
  title!: string;

  @IsUUID()
  courseId!: string;

  @IsUUID()
  groupId!: string;

  @IsOptional()
  @IsUUID()
  teacherEmployeeId?: string;

  @IsISO8601()
  date!: string;

  @IsNumber()
  @IsPositive()
  maxScore!: number;

  @IsNumber()
  @Min(0)
  passingScore!: number;

  @IsEnum(ExamType)
  type!: ExamType;

  @IsOptional()
  @IsString()
  notes?: string;
}
