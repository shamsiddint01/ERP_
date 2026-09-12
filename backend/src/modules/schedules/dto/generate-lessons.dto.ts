import { IsISO8601, IsOptional } from 'class-validator';

/** Both bounds are optional — see SchedulesService.generateLessons() for the defaulting rules. */
export class GenerateLessonsDto {
  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  @IsOptional()
  @IsISO8601()
  toDate?: string;
}
