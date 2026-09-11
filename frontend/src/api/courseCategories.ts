import { apiClient } from './client';
import type { CourseCategoryListItem, CourseCategoryStatus, PaginatedResult } from '../types';

export interface CourseCategoryQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: CourseCategoryStatus;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CourseCategoryPayload {
  name: string;
  code: string;
  description?: string;
  status?: CourseCategoryStatus;
}

export async function listCourseCategories(query: CourseCategoryQuery) {
  const { data } = await apiClient.get<PaginatedResult<CourseCategoryListItem>>('/course-categories', { params: query });
  return data;
}

export async function getCourseCategory(id: string) {
  const { data } = await apiClient.get<CourseCategoryListItem>(`/course-categories/${id}`);
  return data;
}

export async function createCourseCategory(payload: CourseCategoryPayload) {
  const { data } = await apiClient.post<CourseCategoryListItem>('/course-categories', payload);
  return data;
}

export async function updateCourseCategory(id: string, payload: Partial<CourseCategoryPayload>) {
  const { data } = await apiClient.patch<CourseCategoryListItem>(`/course-categories/${id}`, payload);
  return data;
}

export async function deactivateCourseCategory(id: string) {
  const { data } = await apiClient.delete<CourseCategoryListItem>(`/course-categories/${id}`);
  return data;
}
