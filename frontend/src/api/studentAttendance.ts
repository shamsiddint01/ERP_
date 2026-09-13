import { apiClient } from './client';
import type {
  AttendanceSummary,
  BulkAttendanceResult,
  GroupAttendanceSummary,
  PaginatedResult,
  StudentAttendanceDetail,
  StudentAttendanceListItem,
  StudentAttendanceStatus,
  StudentAttendanceSummary,
} from '../types';

export interface StudentAttendanceQuery {
  page?: number;
  pageSize?: number;
  studentId?: string;
  lessonId?: string;
  groupId?: string;
  teacherEmployeeId?: string;
  branchId?: string;
  status?: StudentAttendanceStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateStudentAttendancePayload {
  lessonId: string;
  studentId: string;
  status: StudentAttendanceStatus;
  notes?: string;
}

export interface UpdateStudentAttendancePayload {
  status?: StudentAttendanceStatus;
  notes?: string;
}

export interface BulkAttendanceEntry {
  studentId: string;
  status: StudentAttendanceStatus;
  notes?: string;
}

export async function listStudentAttendance(query: StudentAttendanceQuery) {
  const { data } = await apiClient.get<PaginatedResult<StudentAttendanceListItem>>('/student-attendance', { params: query });
  return data;
}

export async function getStudentAttendance(id: string) {
  const { data } = await apiClient.get<StudentAttendanceDetail>(`/student-attendance/${id}`);
  return data;
}

export async function createStudentAttendance(payload: CreateStudentAttendancePayload) {
  const { data } = await apiClient.post<StudentAttendanceDetail>('/student-attendance', payload);
  return data;
}

export async function updateStudentAttendance(id: string, payload: UpdateStudentAttendancePayload) {
  const { data } = await apiClient.patch<StudentAttendanceDetail>(`/student-attendance/${id}`, payload);
  return data;
}

export async function deleteStudentAttendance(id: string) {
  const { data } = await apiClient.delete<StudentAttendanceDetail>(`/student-attendance/${id}`);
  return data;
}

export async function getAttendanceSummary(query: StudentAttendanceQuery) {
  const { data } = await apiClient.get<AttendanceSummary>('/student-attendance/summary', { params: query });
  return data;
}

export async function getStudentAttendanceHistory(studentId: string, query: { groupId?: string; dateFrom?: string; dateTo?: string }) {
  const { data } = await apiClient.get<StudentAttendanceSummary>(`/students/${studentId}/attendance`, { params: query });
  return data;
}

export async function getGroupAttendanceSummary(groupId: string, query: { dateFrom?: string; dateTo?: string }) {
  const { data } = await apiClient.get<GroupAttendanceSummary>(`/groups/${groupId}/attendance`, { params: query });
  return data;
}

export async function bulkMarkAttendance(lessonId: string, entries: BulkAttendanceEntry[]) {
  const { data } = await apiClient.post<BulkAttendanceResult>(`/lessons/${lessonId}/attendance/bulk`, { entries });
  return data;
}

/** Mirrors downloadReportExport (frontend/src/api/reports.ts) for the three student-attendance report endpoints. */
async function downloadCsv(path: string, query: object, filename: string): Promise<void> {
  const response = await apiClient.get(path, { params: { ...query, format: 'csv' }, responseType: 'blob' });
  const blobUrl = URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${filename}.csv`;
  link.target = '_blank';
  link.click();
  URL.revokeObjectURL(blobUrl);
}

export function downloadAttendanceSummaryCsv(query: StudentAttendanceQuery) {
  return downloadCsv('/student-attendance/summary', query, 'davomat-xulosasi');
}

export function downloadStudentAttendanceCsv(studentId: string, query: { groupId?: string; dateFrom?: string; dateTo?: string }) {
  return downloadCsv(`/students/${studentId}/attendance`, query, `oquvchi-davomati-${studentId}`);
}

export function downloadGroupAttendanceCsv(groupId: string, query: { dateFrom?: string; dateTo?: string }) {
  return downloadCsv(`/groups/${groupId}/attendance`, query, `guruh-davomati-${groupId}`);
}
