import { Controller, Get, Query, Res } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { toCsv } from './report-export.util.js';
import { EducationReportQueryDto } from './dto/education-report-query.dto.js';
import { EducationReportsService } from './education-reports.service.js';
import { ReportPdfService } from './report-pdf.service.js';

@ApiTags('education-reports')
@Controller('reports/education')
export class EducationReportsController {
  constructor(
    private readonly educationReportsService: EducationReportsService,
    private readonly reportPdfService: ReportPdfService,
  ) {}

  @Get('students')
  @RequirePermission('students', PermissionAction.VIEW)
  async students(@Query() query: EducationReportQueryDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.educationReportsService.getStudentsReport(query);
    if (format === 'csv') return this.sendCsv(res, 'education-students', report.enrollmentHistory.items.map(flattenEnrollmentRow));
    if (format === 'pdf') {
      const buffer = await this.reportPdfService.generateTabular(
        'Student Report',
        `Enrollment history — ${new Date().toISOString().slice(0, 10)}`,
        [
          { key: 'studentCode', label: 'Code', width: 70 },
          { key: 'studentName', label: 'Student', width: 140 },
          { key: 'group', label: 'Group', width: 90 },
          { key: 'course', label: 'Course', width: 90 },
          { key: 'branch', label: 'Branch', width: 80 },
          { key: 'status', label: 'Status', width: 85, align: 'right' },
        ],
        report.enrollmentHistory.items.map(flattenEnrollmentRow).map((r) => ({ studentCode: r.studentCode, studentName: r.studentName, group: r.group, course: r.course, branch: r.branch, status: r.status })),
        [
          { label: 'Total Students', value: String(report.totalStudents) },
          { label: 'Active', value: String(report.activeStudents) },
          { label: 'Inactive', value: String(report.inactiveStudents) },
        ],
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="education-students.pdf"');
      return res.send(buffer);
    }
    return res.json(report);
  }

  @Get('groups')
  @RequirePermission('groups', PermissionAction.VIEW)
  async groups(@Query() query: EducationReportQueryDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.educationReportsService.getGroupsReport(query);
    if (format === 'csv') {
      const utilByGroup = new Map(report.capacityUtilization.map((u) => [u.groupId, u]));
      const rows = report.groups.items.map((g) => ({
        code: g.code,
        name: g.name,
        course: g.course.name,
        branch: g.branch.name,
        teacher: g.teacher?.fullName ?? '',
        status: g.status,
        capacity: utilByGroup.get(g.id)?.capacity ?? '',
        enrolledCount: g.enrolledCount,
        utilizationPercentage: utilByGroup.get(g.id)?.utilizationPercentage ?? '',
      }));
      return this.sendCsv(res, 'education-groups', rows);
    }
    if (format === 'pdf') {
      const utilByGroup = new Map(report.capacityUtilization.map((u) => [u.groupId, u]));
      const rows = report.groups.items.map((g) => ({
        code: g.code,
        name: g.name,
        course: g.course.name,
        branch: g.branch.name,
        teacher: g.teacher?.fullName ?? '',
        enrolled: String(g.enrolledCount),
        utilization: `${utilByGroup.get(g.id)?.utilizationPercentage ?? 0}%`,
      }));
      const buffer = await this.reportPdfService.generateTabular(
        'Group Report',
        `Capacity & performance — ${new Date().toISOString().slice(0, 10)}`,
        [
          { key: 'code', label: 'Code', width: 60 },
          { key: 'name', label: 'Group', width: 120 },
          { key: 'course', label: 'Course', width: 90 },
          { key: 'branch', label: 'Branch', width: 80 },
          { key: 'teacher', label: 'Teacher', width: 100 },
          { key: 'enrolled', label: 'Enrolled', width: 45, align: 'right' },
          { key: 'utilization', label: 'Util.', width: 45, align: 'right' },
        ],
        rows,
        [
          { label: 'Total Groups', value: String(report.groupCount) },
          { label: 'Avg Utilization', value: `${report.averageUtilization}%` },
        ],
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="education-groups.pdf"');
      return res.send(buffer);
    }
    return res.json(report);
  }

  @Get('attendance')
  @RequirePermission('student_attendance', PermissionAction.VIEW)
  async attendance(@Query() query: EducationReportQueryDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.educationReportsService.getAttendanceReport(query);
    if (format === 'csv') {
      const rows = report.byStudent.map((r) => ({
        studentCode: 'studentCode' in r.student ? r.student.studentCode : '',
        studentName: 'fullName' in r.student ? r.student.fullName : '',
        present: r.present,
        absent: r.absent,
        late: r.late,
        excused: r.excused,
        total: r.total,
        attendancePercentage: r.attendancePercentage,
      }));
      return this.sendCsv(res, 'education-attendance', rows);
    }
    return res.json(report);
  }

  @Get('academic')
  @RequirePermission('grades', PermissionAction.VIEW)
  async academic(@Query() query: EducationReportQueryDto, @Query('format') format: string | undefined, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const report = await this.educationReportsService.getAcademicReport(query, user.id);
    if (format === 'csv') {
      const rows =
        report.scope === 'overview'
          ? report.examResults.items.map((e) => ({ title: e.title, course: e.course.name, group: e.group.name, date: e.date, assessedCount: e.assessedCount, average: e.average, passRate: e.passRate }))
          : report.studentProgress.recentExams.map((e) => ({ exam: e.examTitle, date: e.examDate, score: e.score, maxScore: e.maxScore, percentage: e.percentage, grade: e.grade, passed: e.passed }));
      return this.sendCsv(res, 'education-academic', rows);
    }
    return res.json(report);
  }

  @Get('tuition')
  @RequirePermission('tuition', PermissionAction.VIEW)
  async tuition(@Query() query: EducationReportQueryDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.educationReportsService.getTuitionReport(query);
    if (format === 'csv') {
      const rows = Object.entries(report.paymentMethodBreakdown).map(([method, v]) => ({ method, count: v.count, amount: v.amount }));
      return this.sendCsv(res, 'education-tuition', rows);
    }
    return res.json(report);
  }

  @Get('teachers')
  @RequirePermission('teachers', PermissionAction.VIEW)
  async teachers(@Query() query: EducationReportQueryDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.educationReportsService.getTeachersReport(query);
    if (format === 'csv') {
      const rows = report.items.map((t) => ({
        employeeCode: t.employeeCode,
        name: t.name,
        groups: t.groups,
        students: t.students,
        lessonCount: t.lessonCount,
        hours: t.hours,
        attendancePercentage: t.attendance.percentage,
      }));
      return this.sendCsv(res, 'education-teachers', rows);
    }
    if (format === 'pdf') {
      const rows = report.items.map((t) => ({
        employeeCode: t.employeeCode,
        name: t.name,
        groups: String(t.groups),
        students: String(t.students),
        lessonCount: String(t.lessonCount),
        hours: String(t.hours),
        attendance: `${t.attendance.percentage}%`,
      }));
      const buffer = await this.reportPdfService.generateTabular(
        'Teacher Report',
        `Workload & attendance — ${new Date().toISOString().slice(0, 10)}`,
        [
          { key: 'employeeCode', label: 'Code', width: 65 },
          { key: 'name', label: 'Teacher', width: 130 },
          { key: 'groups', label: 'Groups', width: 55, align: 'right' },
          { key: 'students', label: 'Students', width: 55, align: 'right' },
          { key: 'lessonCount', label: 'Lessons', width: 55, align: 'right' },
          { key: 'hours', label: 'Hours', width: 55, align: 'right' },
          { key: 'attendance', label: 'Attend.', width: 55, align: 'right' },
        ],
        rows,
        [{ label: 'Total Teachers', value: String(report.total) }],
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="education-teachers.pdf"');
      return res.send(buffer);
    }
    return res.json(report);
  }

  @Get('branches')
  @RequirePermission('branches', PermissionAction.VIEW)
  async branches(@Query() query: EducationReportQueryDto, @Query('format') format: string | undefined, @Res() res: Response) {
    const report = await this.educationReportsService.getBranchesReport(query);
    if (format === 'csv') {
      const rows = report.items.map((b) => ({
        branch: b.branchName,
        students: b.students,
        groups: b.groups,
        teachers: b.teachers,
        tuitionBilled: b.tuition.billed,
        tuitionCollected: b.tuition.collected,
        attendancePercentage: b.attendance.percentage,
      }));
      return this.sendCsv(res, 'education-branches', rows);
    }
    return res.json(report);
  }

  /** Plain JSON only — this is the cross-category KPI composition meant for a future Phase J dashboard controller to call, not a report a user opens directly. */
  @Get('dashboard')
  @RequirePermission('reports', PermissionAction.VIEW)
  dashboard() {
    return this.educationReportsService.getDashboardData();
  }

  private sendCsv(res: Response, name: string, rows: Record<string, unknown>[]) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    return res.send(toCsv(rows));
  }
}

function flattenEnrollmentRow(e: {
  student: { studentCode: string; fullName: string };
  group: { name: string; course: { name: string }; branch: { name: string } };
  startDate: Date;
  endDate: Date | null;
  status: string;
}) {
  return {
    studentCode: e.student.studentCode,
    studentName: e.student.fullName,
    group: e.group.name,
    course: e.group.course.name,
    branch: e.group.branch.name,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status,
  };
}
