import { apiClient } from './client';
import type { PaginatedResult, TeacherDetail, TeacherListItem, TeacherProfileStatus } from '../types';

export interface TeacherQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: TeacherProfileStatus;
  branchId?: string;
  departmentId?: string;
}

export interface CreateTeacherPayload {
  employeeId: string;
  bio?: string;
  specialization?: string;
  qualification?: string;
  experienceYears?: number;
  hourlyRate?: number;
  perLessonRate?: number;
  perGroupRate?: number;
  status?: TeacherProfileStatus;
}

export type UpdateTeacherPayload = Partial<Omit<CreateTeacherPayload, 'employeeId'>>;

export async function listTeachers(query: TeacherQuery) {
  const { data } = await apiClient.get<PaginatedResult<TeacherListItem>>('/teachers', { params: query });
  return data;
}

export async function getTeacher(id: string) {
  const { data } = await apiClient.get<TeacherDetail>(`/teachers/${id}`);
  return data;
}

export async function createTeacher(payload: CreateTeacherPayload) {
  const { data } = await apiClient.post<TeacherDetail>('/teachers', payload);
  return data;
}

export async function updateTeacher(id: string, payload: UpdateTeacherPayload) {
  const { data } = await apiClient.patch<TeacherDetail>(`/teachers/${id}`, payload);
  return data;
}

export async function deactivateTeacher(id: string) {
  const { data } = await apiClient.delete<TeacherDetail>(`/teachers/${id}`);
  return data;
}
