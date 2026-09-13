import { StudentAttendanceStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * No enrollmentId here — it is never client-supplied. The service resolves
 * the enrollment valid for the lesson's date itself (the same lookup that
 * proves the student is eligible in the first place), so a caller can never
 * forge a mismatched enrollment link.
 */
export class CreateStudentAttendanceDto {
  @IsUUID()
  lessonId!: string;

  @IsUUID()
  studentId!: string;

  @IsEnum(StudentAttendanceStatus)
  status!: StudentAttendanceStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
