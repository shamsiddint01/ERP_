import { apiClient } from './client';
import type { LessonDetail, LessonListItem, LessonStatus, PaginatedResult } from '../types';

export interface LessonQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  groupId?: string;
  scheduleId?: string;
  teacherEmployeeId?: string;
  classroomId?: string;
  branchId?: string;
  status?: LessonStatus;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CreateLessonPayload {
  groupId: string;
  scheduleId?: string;
  teacherEmployeeId?: string;
  classroomId?: string;
  branchId: string;
  scheduledStart: string;
  scheduledEnd: string;
  topic?: string;
  homework?: string;
  notes?: string;
}

export interface UpdateLessonPayload {
  teacherEmployeeId?: string;
  classroomId?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  topic?: string;
  homework?: string;
  notes?: string;
}

export async function listLessons(query: LessonQuery) {
  const { data } = await apiClient.get<PaginatedResult<LessonListItem>>('/lessons', { params: query });
  return data;
}

export async function getLesson(id: string) {
  const { data } = await apiClient.get<LessonDetail>(`/lessons/${id}`);
  return data;
}

export async function createLesson(payload: CreateLessonPayload) {
  const { data } = await apiClient.post<LessonDetail>('/lessons', payload);
  return data;
}

export async function updateLesson(id: string, payload: UpdateLessonPayload) {
  const { data } = await apiClient.patch<LessonDetail>(`/lessons/${id}`, payload);
  return data;
}

/** Maps to the generic no-hard-delete DELETE route (cancels, same as the /cancel action). */
export async function deleteLesson(id: string) {
  const { data } = await apiClient.delete<LessonDetail>(`/lessons/${id}`);
  return data;
}

export async function startLesson(id: string) {
  const { data } = await apiClient.post<LessonDetail>(`/lessons/${id}/start`);
  return data;
}

export async function completeLesson(id: string) {
  const { data } = await apiClient.post<LessonDetail>(`/lessons/${id}/complete`);
  return data;
}

export async function cancelLesson(id: string) {
  const { data } = await apiClient.post<LessonDetail>(`/lessons/${id}/cancel`);
  return data;
}

export async function noShowLesson(id: string) {
  const { data } = await apiClient.post<LessonDetail>(`/lessons/${id}/no-show`);
  return data;
}
