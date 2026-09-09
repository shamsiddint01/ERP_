import { AttendanceStatus, LeaveType } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

export class UpdateAttendanceDto {
  @IsOptional()
  @IsISO8601()
  checkInAt?: string;

  @IsOptional()
  @IsISO8601()
  checkOutAt?: string;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @IsEnum(LeaveType)
  leaveType?: LeaveType;

  @IsOptional()
  @IsString()
  notes?: string;
}
