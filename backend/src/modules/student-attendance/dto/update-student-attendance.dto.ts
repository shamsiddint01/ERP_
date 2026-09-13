import { StudentAttendanceStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/** lessonId/studentId/enrollmentId are immutable after creation — correcting a mistaken mark means changing its status/notes, never which lesson or student it points at (create a new one, or delete this one, instead). */
export class UpdateStudentAttendanceDto {
  @IsOptional()
  @IsEnum(StudentAttendanceStatus)
  status?: StudentAttendanceStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
