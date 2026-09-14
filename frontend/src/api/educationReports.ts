import { apiClient } from './client';
import { downloadReportExport } from './reports';
import type { StudentProgress } from '../types';

export interface EducationReportQuery {
  from?: string;
  to?: string;
  branchId?: string;
  courseId?: string;
  groupId?: string;
  teacherEmployeeId?: string;
  studentId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EnrollmentHistoryRow {
  id: string;
  startDate: string;
  endDate: string | null;
  status: string;
  student: { id: string; studentCode: string; fullName: string };
  group: { id: string; name: string; code: string; course: { id: string; name: string }; branch: { id: string; name: string } };
}

export interface StudentsReport {
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  byStatus: Record<string, number>;
  byBranch: { branchId: string | null; branchName: string; count: number }[];
  byCourse: { courseId: string; courseName: string; studentCount: number }[];
  byGroup: { groupId: string; groupName: string; studentCount: number }[];
  newStudentsByPeriod: { period: string; count: number }[];
  enrollmentHistory: Paginated<EnrollmentHistoryRow>;
}

export interface GroupsReport {
  groupCount: number;
  studentCount: number;
  averageUtilization: number;
  capacityUtilization: { groupId: string; name: string; code: string; capacity: number; enrolledCount: number; utilizationPercentage: number }[];
  teacherWorkload: { teacherEmployeeId: string; name: string; groupsCount: number; studentsCount: number }[];
  groupPerformance: { groupId: string; name: string; overallAverage: number; overallPassRate: number; assessedCount: number }[];
  groups: Paginated<{
    id: string;
    name: string;
    code: string;
    course: { id: string; name: string };
    branch: { id: string; name: string };
    teacher: { id: string; fullName: string } | null;
    status: string;
    enrolledCount: number;
  }>;
}

interface AttendanceTally {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  attendancePercentage: number;
}

export interface AttendanceReport {
  overall: AttendanceTally & { totalMarked: number; absenceRate: number; lateRate: number; excusedRate: number };
  byStudent: (AttendanceTally & { student: { id: string; studentCode?: string; fullName?: string } })[];
  byGroup: (AttendanceTally & { group: { id: string; name?: string; code?: string } })[];
  byTeacher: (AttendanceTally & { teacher: { id: string; fullName?: string } })[];
}

export interface ExamResultRow {
  examId: string;
  title: string;
  course: { id: string; name: string };
  group: { id: string; name: string };
  date: string;
  assessedCount: number;
  average: number;
  passRate: number;
}

export interface AcademicOverviewReport {
  scope: 'overview';
  averageScore: number;
  passRate: number;
  examResults: Paginated<ExamResultRow>;
  coursePerformance: { courseId: string; courseName: string; average: number; assessedCount: number }[];
  groupPerformance: { groupId: string; groupName: string; average: number; assessedCount: number }[];
}

export interface AcademicStudentReport {
  scope: 'student';
  studentProgress: StudentProgress;
}

export type AcademicReport = AcademicOverviewReport | AcademicStudentReport;

export interface TuitionReport {
  billed: { rows: { billingPeriod: string; count: number; amount: number; discountAmount: number; netAmount: number }[]; totalBilled: number };
  collected: { rows: { billingPeriod: string; totalCollected: number }[]; totalCollected: number; count: number };
  outstanding: { rows: unknown[]; totalOutstanding: number };
  overdue: { rows: unknown[]; totalOverdue: number };
  collectionRate: { rows: { billingPeriod: string; totalBilled: number; totalCollected: number; collectionRate: number }[]; collectionRate: number };
  paymentMethodBreakdown: Record<string, { count: number; amount: number }>;
}

export interface TeachersReportRow {
  teacherEmployeeId: string;
  teacherProfileId: string;
  name: string;
  employeeCode: string;
  groups: number;
  students: number;
  lessonCount: number;
  hours: number;
  attendance: { total: number; percentage: number };
  workload: { groups: number; students: number; lessonCount: number; hours: number };
  compensation?: { totalAmount?: number } | null;
}

export type TeachersReport = Paginated<TeachersReportRow>;

export interface AdmissionsReport {
  leads: number;
  byStatus: Record<string, number>;
  conversionRate: number;
  enrolled: number;
  lost: number;
  leadSource: { source: string; count: number }[];
  enrollmentConversion: { convertedLeadsCount: number; withRealEnrollment: number; rate: number };
  followUpStatus: { overdue: number; upcoming: number; notScheduled: number };
}

export interface BranchesReport {
  items: {
    branchId: string;
    branchName: string;
    students: number;
    groups: number;
    teachers: number;
    tuition: { billed: number; collected: number };
    attendance: { totalMarked: number; percentage: number };
  }[];
}

export interface EducationDashboard {
  totalStudents: number;
  activeStudents: number;
  groupCount: number;
  averageUtilization: number;
  attendancePercentage: number;
  averageScore: number | null;
  passRate: number | null;
  tuitionBilled: number;
  tuitionCollected: number;
  tuitionOutstanding: number;
  leadConversionRate: number;
}

async function get<T>(path: string, query: EducationReportQuery) {
  const { data } = await apiClient.get<T>(`/reports/education/${path}`, { params: query });
  return data;
}

export const getStudentsReport = (query: EducationReportQuery) => get<StudentsReport>('students', query);
export const getGroupsReport = (query: EducationReportQuery) => get<GroupsReport>('groups', query);
export const getAttendanceReport = (query: EducationReportQuery) => get<AttendanceReport>('attendance', query);
export const getAcademicReport = (query: EducationReportQuery) => get<AcademicReport>('academic', query);
export const getTuitionReport = (query: EducationReportQuery) => get<TuitionReport>('tuition', query);
export const getTeachersReport = (query: EducationReportQuery) => get<TeachersReport>('teachers', query);
export const getAdmissionsReport = (query: EducationReportQuery) => get<AdmissionsReport>('admissions', query);
export const getBranchesReport = (query: EducationReportQuery) => get<BranchesReport>('branches', query);
export const getEducationDashboard = () => get<EducationDashboard>('dashboard', {});

/** Thin wrapper around the existing downloadReportExport (frontend/src/api/reports.ts) — the education endpoints just live one path segment deeper. */
export function downloadEducationReportExport(reportPath: string, format: 'csv' | 'pdf', query: EducationReportQuery, filename: string): Promise<void> {
  return downloadReportExport(`education/${reportPath}`, format, query, filename);
}
