import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLessonDto {
  @IsUUID()
  groupId!: string;

  /** Omitted for a manually created, ad-hoc lesson (make-up class, trial lesson) not tied to any recurring Schedule. */
  @IsOptional()
  @IsUUID()
  scheduleId?: string;

  @IsOptional()
  @IsUUID()
  teacherEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsUUID()
  branchId!: string;

  @IsISO8601()
  scheduledStart!: string;

  @IsISO8601()
  scheduledEnd!: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  homework?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
