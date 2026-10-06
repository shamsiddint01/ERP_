import { apiClient } from './client';
import type { ExtraLessonDetail, ExtraLessonItem, ExtraLessonStatus, PaginatedResult } from '../types';

export interface ExtraLessonPayload {
  title: string;
  description?: string;
  teacherEmployeeId?: string;
  courseId?: string;
  branchId?: string;
  room?: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status?: ExtraLessonStatus;
}

export async function listExtraLessons(query: { status?: ExtraLessonStatus; upcoming?: boolean; page?: number; pageSize?: number; search?: string }) {
  const { data } = await apiClient.get<PaginatedResult<ExtraLessonItem>>('/extra-lessons', { params: query });
  return data;
}

export async function getExtraLesson(id: string) {
  const { data } = await apiClient.get<ExtraLessonDetail>(`/extra-lessons/${id}`);
  return data;
}

export async function createExtraLesson(payload: ExtraLessonPayload) {
  const { data } = await apiClient.post('/extra-lessons', payload);
  return data;
}

export async function updateExtraLesson(id: string, payload: Partial<ExtraLessonPayload>) {
  const { data } = await apiClient.patch(`/extra-lessons/${id}`, payload);
  return data;
}

export async function deleteExtraLesson(id: string) {
  await apiClient.delete(`/extra-lessons/${id}`);
}
