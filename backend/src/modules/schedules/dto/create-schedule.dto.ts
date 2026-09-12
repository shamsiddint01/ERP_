import { ScheduleDayOfWeek, ScheduleRecurrenceType, ScheduleStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateScheduleDto {
  @IsUUID()
  groupId!: string;

  @IsOptional()
  @IsUUID()
  teacherEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsUUID()
  branchId!: string;

  @IsEnum(ScheduleDayOfWeek)
  dayOfWeek!: ScheduleDayOfWeek;

  @Matches(TIME_PATTERN, { message: 'startTime must be in 24-hour HH:mm format' })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: 'endTime must be in 24-hour HH:mm format' })
  endTime!: string;

  @IsISO8601()
  startDate!: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsEnum(ScheduleRecurrenceType)
  recurrenceType?: ScheduleRecurrenceType;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
