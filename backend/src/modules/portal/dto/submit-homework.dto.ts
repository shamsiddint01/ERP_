import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SubmitHomeworkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  answerText!: string;

  /** Optional link to the work (Google Drive, a photo, a repo...). http(s) only. */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(1000)
  link?: string;
}
