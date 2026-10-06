import { IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateHomeworkDto {
  @IsUUID()
  groupId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsISO8601()
  dueDate!: string;

  /** Defaults to 100. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxScore?: number;
}
