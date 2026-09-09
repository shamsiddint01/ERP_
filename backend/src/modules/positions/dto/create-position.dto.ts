import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreatePositionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  departmentId!: string;
}
