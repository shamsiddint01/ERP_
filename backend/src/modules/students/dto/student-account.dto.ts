import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const USERNAME_RULE = /^[a-zA-Z0-9._-]+$/;

export class CreateStudentAccountDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  @Matches(USERNAME_RULE, { message: "Login faqat lotin harflari, raqamlar va . _ - belgilaridan iborat bo'lishi kerak" })
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;
}

export class UpdateStudentAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password?: string;

  /** false blocks the login (and signs the student out everywhere); true unblocks it. */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
