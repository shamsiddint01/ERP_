import { Controller, Get, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import { AuditLogService } from './audit-log.service.js';
import { QueryAuditLogDto } from './dto/query-audit-log.dto.js';

@ApiTags('audit-logs')
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermission('audit_logs', PermissionAction.VIEW)
  findAll(@Query() query: QueryAuditLogDto) {
    return this.auditLogService.findAll(query);
  }
}
