import { StudentAttendanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class BulkAttendanceEntryDto {
  @IsUUID()
  studentId!: string;

  @IsEnum(StudentAttendanceStatus)
  status!: StudentAttendanceStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Upsert semantics per entry: marking a student who already has a record for this lesson corrects it in place rather than erroring as a duplicate — exactly what re-saving a teacher's attendance sheet needs to do. */
export class BulkMarkAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceEntryDto)
  entries!: BulkAttendanceEntryDto[];
}
