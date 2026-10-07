import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Intentionally narrower than CreateLessonDto — no groupId/branchId/scheduleId.
 * Moving a lesson to a different group/branch/schedule after the fact isn't a
 * real operation (cancel and create a new one instead); this DTO only covers
 * genuine "reschedule" fields plus the always-editable descriptive content.
 * There is no `status` field — status only ever changes through the guarded
 * start/complete/cancel workflow actions, never a raw PATCH.
 */
export class UpdateLessonDto {
  @IsOptional()
  @IsUUID()
  teacherEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsISO8601()
  scheduledStart?: string;

  @IsOptional()
  @IsISO8601()
  scheduledEnd?: string;

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
