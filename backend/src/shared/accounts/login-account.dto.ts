import { IsBoolean } from 'class-validator';

/** false blocks the login (and signs the person out everywhere); true unblocks it. */
export class SetLoginActiveDto {
  @IsBoolean()
  active!: boolean;
}
