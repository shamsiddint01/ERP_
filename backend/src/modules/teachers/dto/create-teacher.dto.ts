import { TeacherProfileStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/**
 * A teacher is created in one step: the underlying Employee record (the
 * identity a User login and group/schedule/lesson assignments link to) is
 * created together with the TeacherProfile — there is no separate HR module.
 */
export class CreateTeacherDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** Defaults to today. */
  @IsOptional()
  @IsISO8601()
  hireDate?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  experienceYears?: number;

  @IsOptional()
  @IsEnum(TeacherProfileStatus)
  status?: TeacherProfileStatus;
}
