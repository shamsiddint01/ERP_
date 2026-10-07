import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { RecordSalaryPaymentDto } from './dto/record-salary-payment.dto.js';
import { SalaryPeriodQueryDto } from './dto/salary-period.dto.js';
import { SalariesService } from './salaries.service.js';

@ApiTags('salaries')
@Controller('salaries')
export class SalariesController {
  constructor(private readonly salariesService: SalariesService) {}

  /** The teacher's own salary (teacher portal). */
  @Get('me')
  @RequirePermission('teacher_portal', PermissionAction.VIEW)
  mine(@Query() query: SalaryPeriodQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.salariesService.mine(user.id, query.period);
  }

  @Get()
  @RequirePermission('salaries', PermissionAction.VIEW)
  overview(@Query() query: SalaryPeriodQueryDto) {
    return this.salariesService.overview(query.period);
  }

  @Get('teachers/:employeeId')
  @RequirePermission('salaries', PermissionAction.VIEW)
  forTeacher(@Param('employeeId', ParseUUIDPipe) employeeId: string, @Query() query: SalaryPeriodQueryDto) {
    return this.salariesService.forTeacher(employeeId, query.period);
  }

  @Post('payments')
  @RequirePermission('salaries', PermissionAction.CREATE)
  @Audited('TeacherSalaryPayment')
  recordPayment(@Body() dto: RecordSalaryPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.salariesService.recordPayment(dto, user.id);
  }

  @Delete('payments/:id')
  @RequirePermission('salaries', PermissionAction.DELETE)
  @Audited('TeacherSalaryPayment', 'DELETE')
  deletePayment(@Param('id', ParseUUIDPipe) id: string) {
    return this.salariesService.deletePayment(id);
  }
}
