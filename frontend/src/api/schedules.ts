import { apiClient } from './client';
import type { GenerateLessonsResult, PaginatedResult, ScheduleDayOfWeek, ScheduleDetail, ScheduleListItem, ScheduleRecurrenceType, ScheduleStatus } from '../types';

export interface ScheduleQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  groupId?: string;
  teacherEmployeeId?: string;
  branchId?: string;
  classroomId?: string;
  dayOfWeek?: ScheduleDayOfWeek;
  status?: ScheduleStatus;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface SchedulePayload {
  groupId: string;
  teacherEmployeeId?: string;
  classroomId?: string;
  branchId: string;
  dayOfWeek: ScheduleDayOfWeek;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate?: string;
  recurrenceType?: ScheduleRecurrenceType;
  status?: ScheduleStatus;
  notes?: string;
}

export async function listSchedules(query: ScheduleQuery) {
  const { data } = await apiClient.get<PaginatedResult<ScheduleListItem>>('/schedules', { params: query });
  return data;
}

export async function getSchedule(id: string) {
  const { data } = await apiClient.get<ScheduleDetail>(`/schedules/${id}`);
  return data;
}

export async function createSchedule(payload: SchedulePayload) {
  const { data } = await apiClient.post<ScheduleDetail>('/schedules', payload);
  return data;
}

export async function updateSchedule(id: string, payload: Partial<SchedulePayload>) {
  const { data } = await apiClient.patch<ScheduleDetail>(`/schedules/${id}`, payload);
  return data;
}

export async function cancelSchedule(id: string) {
  const { data } = await apiClient.delete<ScheduleDetail>(`/schedules/${id}`);
  return data;
}

export async function generateLessons(id: string, payload: { fromDate?: string; toDate?: string }) {
  const { data } = await apiClient.post<GenerateLessonsResult>(`/schedules/${id}/generate-lessons`, payload);
  return data;
}
