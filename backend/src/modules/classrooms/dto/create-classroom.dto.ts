import { ClassroomStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateClassroomDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  name!: string;

  @IsString()
  roomNumber!: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsString()
  equipment?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(ClassroomStatus)
  status?: ClassroomStatus;
}
