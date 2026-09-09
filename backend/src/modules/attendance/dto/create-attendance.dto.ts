import { AttendanceStatus, LeaveType } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAttendanceDto {
  @IsUUID()
  employeeId!: string;

  @IsISO8601()
  workDate!: string;

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
