import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

/** Shared query shape for the nested GET /students/:id/attendance and GET /groups/:id/attendance report routes. groupId is meaningful only on the student route (the group route's own :id already fixes the group). */
export class AttendanceDateRangeDto {
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  /**
   * Response format. Declared here purely so the global forbidNonWhitelisted
   * ValidationPipe doesn't 400 the request — the controller reads it via its
   * own `@Query('format')` param (mirrors ReportDateRangeDto).
   */
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: string;
}
