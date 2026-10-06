import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Audited } from '../../shared/decorators/audited.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { CreateLoginDto, UpdateLoginDto } from '../../shared/accounts/login-account.dto.js';
import { toCsv } from '../reports/report-export.util.js';
import { AttendanceDateRangeDto } from '../student-attendance/dto/attendance-date-range.dto.js';
import { StudentAttendanceService } from '../student-attendance/student-attendance.service.js';
import { GrantDiscountDto } from '../discounts/dto/grant-discount.dto.js';
import { DiscountsService } from '../discounts/discounts.service.js';
import { AcademicProgressService } from '../exams/academic-progress.service.js';
import { StudentFinanceService } from '../tuition/student-finance.service.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { QueryStudentDto } from './dto/query-student.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';
import { StudentAccountService } from './student-account.service.js';
import { StudentsService } from './students.service.js';

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly studentAttendanceService: StudentAttendanceService,
    private readonly studentFinanceService: StudentFinanceService,
    private readonly discountsService: DiscountsService,
    private readonly academicProgressService: AcademicProgressService,
    private readonly studentAccountService: StudentAccountService,
  ) {}

  @Get()
  @RequirePermission('students', PermissionAction.VIEW)
  findAll(@Query() query: QueryStudentDto) {
    return this.studentsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('students', PermissionAction.VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentsService.findOne(id);
  }

  @Post()
  @RequirePermission('students', PermissionAction.CREATE)
  @Audited('Student')
  create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('students', PermissionAction.EDIT)
  @Audited('Student')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('students', PermissionAction.DELETE)
  @Audited('Student', 'DEACTIVATE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentsService.remove(id);
  }

  @Get(':id/attendance')
  @RequirePermission('student_attendance', PermissionAction.VIEW)
  async attendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AttendanceDateRangeDto,
    @Query('format') format: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const report = await this.studentAttendanceService.getStudentSummary(id, query, user.id);
    if (format === 'csv') {
      const rows = report.records.map((r) => ({
        date: r.scheduledStart,
        group: r.group.name,
        topic: r.topic ?? '',
        status: r.status,
        notes: r.notes ?? '',
      }));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="student-${id}-attendance.csv"`);
      return res.send(toCsv(rows));
    }
    return res.json(report);
  }

  @Get(':id/balance')
  @RequirePermission('tuition', PermissionAction.VIEW)
  balance(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentFinanceService.getBalance(id);
  }

  @Get(':id/financial-summary')
  @RequirePermission('tuition', PermissionAction.VIEW)
  financialSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentFinanceService.getFinancialSummary(id);
  }

  @Get(':id/discounts')
  @RequirePermission('discounts', PermissionAction.VIEW)
  listDiscountGrants(@Param('id', ParseUUIDPipe) id: string) {
    return this.discountsService.listStudentGrants(id);
  }

  @Post(':id/discounts')
  @RequirePermission('discounts', PermissionAction.CREATE)
  @Audited('StudentDiscount')
  grantDiscount(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GrantDiscountDto) {
    return this.discountsService.grantToStudent(id, dto);
  }

  @Delete(':id/discounts/:studentDiscountId')
  @RequirePermission('discounts', PermissionAction.DELETE)
  @Audited('StudentDiscount', 'REVOKE')
  revokeDiscount(@Param('id', ParseUUIDPipe) id: string, @Param('studentDiscountId', ParseUUIDPipe) studentDiscountId: string) {
    return this.discountsService.revokeGrant(id, studentDiscountId);
  }

  @Get(':id/progress')
  @RequirePermission('exams', PermissionAction.VIEW)
  progress(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.academicProgressService.getStudentProgress(id, user.id);
  }

  @Get(':id/grades')
  @RequirePermission('grades', PermissionAction.VIEW)
  grades(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.academicProgressService.getStudentGrades(id, user.id);
  }

  // ---------------------------------------------------------------------------
  // Portal login — staff type the username/password and give them to the student
  // ---------------------------------------------------------------------------

  @Get(':id/account')
  @RequirePermission('students', PermissionAction.VIEW)
  getAccount(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentAccountService.get(id);
  }

  @Post(':id/account')
  @RequirePermission('students', PermissionAction.EDIT)
  @Audited('Student', 'ACCOUNT_CREATE')
  createAccount(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLoginDto) {
    return this.studentAccountService.create(id, dto);
  }

  @Patch(':id/account')
  @RequirePermission('students', PermissionAction.EDIT)
  @Audited('Student', 'ACCOUNT_UPDATE')
  updateAccount(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLoginDto) {
    return this.studentAccountService.update(id, dto);
  }
}
