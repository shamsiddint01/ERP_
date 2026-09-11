import { apiClient } from './client';
import type { CourseDetail, CourseLevel, CourseListItem, CourseStatus, PaginatedResult } from '../types';

export interface CourseQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  status?: CourseStatus;
  level?: CourseLevel;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CoursePayload {
  categoryId?: string;
  name: string;
  code: string;
  description?: string;
  level?: CourseLevel;
  durationWeeks?: number;
  lessonDurationMinutes?: number;
  defaultTuition?: number;
  status?: CourseStatus;
}

export async function listCourses(query: CourseQuery) {
  const { data } = await apiClient.get<PaginatedResult<CourseListItem>>('/courses', { params: query });
  return data;
}

export async function getCourse(id: string) {
  const { data } = await apiClient.get<CourseDetail>(`/courses/${id}`);
  return data;
}

export async function createCourse(payload: CoursePayload) {
  const { data } = await apiClient.post<CourseDetail>('/courses', payload);
  return data;
}

export async function updateCourse(id: string, payload: Partial<CoursePayload>) {
  const { data } = await apiClient.patch<CourseDetail>(`/courses/${id}`, payload);
  return data;
}

export async function deactivateCourse(id: string) {
  const { data } = await apiClient.delete<CourseDetail>(`/courses/${id}`);
  return data;
}
