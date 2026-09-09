import { apiClient } from './client';
import type { AttendanceOverview, AttendanceRecordItem, AttendanceStatus, LeaveType, PaginatedResult } from '../types';

export interface AttendanceQuery {
  page?: number;
  pageSize?: number;
  employeeId?: string;
  departmentId?: string;
  status?: AttendanceStatus;
  from?: string;
  to?: string;
}

export interface CreateAttendancePayload {
  employeeId: string;
  workDate: string;
  checkInAt?: string;
  checkOutAt?: string;
  status?: AttendanceStatus;
  leaveType?: LeaveType;
  notes?: string;
}

export interface UpdateAttendancePayload {
  checkInAt?: string;
  checkOutAt?: string;
  status?: AttendanceStatus;
  leaveType?: LeaveType;
  notes?: string;
}

export async function listAttendance(query: AttendanceQuery) {
  const { data } = await apiClient.get<PaginatedResult<AttendanceRecordItem>>('/attendance', { params: query });
  return data;
}

export async function getAttendanceOverview() {
  const { data } = await apiClient.get<AttendanceOverview>('/attendance/overview');
  return data;
}

export async function createAttendance(payload: CreateAttendancePayload) {
  const { data } = await apiClient.post<AttendanceRecordItem>('/attendance', payload);
  return data;
}

export async function updateAttendance(id: string, payload: UpdateAttendancePayload) {
  const { data } = await apiClient.patch<AttendanceRecordItem>(`/attendance/${id}`, payload);
  return data;
}

export async function deleteAttendance(id: string) {
  await apiClient.delete(`/attendance/${id}`);
}

export async function checkIn(employeeId: string, notes?: string) {
  const { data } = await apiClient.post<AttendanceRecordItem>('/attendance/check-in', { employeeId, notes });
  return data;
}

export async function checkOut(employeeId: string, notes?: string) {
  const { data } = await apiClient.post<AttendanceRecordItem>('/attendance/check-out', { employeeId, notes });
  return data;
}

export type AttendanceReportType = 'summary' | 'late' | 'absence' | 'overtime' | 'employee';

export interface AttendanceReportQuery {
  type: AttendanceReportType;
  from?: string;
  to?: string;
  departmentId?: string;
  employeeId?: string;
}

export async function getAttendanceReport(query: AttendanceReportQuery) {
  const { data } = await apiClient.get('/attendance/reports', { params: query });
  return data;
}

/** Fetches the report as a CSV blob (so the auth header goes along) and triggers a browser download. */
export async function downloadAttendanceReport(query: AttendanceReportQuery): Promise<void> {
  const response = await apiClient.get('/attendance/reports', { params: { ...query, format: 'csv' }, responseType: 'blob' });
  const blobUrl = URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `attendance-${query.type}.csv`;
  link.target = '_blank';
  link.click();
  URL.revokeObjectURL(blobUrl);
}
