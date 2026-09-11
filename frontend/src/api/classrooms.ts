import { apiClient } from './client';
import type { ClassroomDetail, ClassroomListItem, ClassroomStatus, PaginatedResult } from '../types';

export interface ClassroomQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  branchId?: string;
  status?: ClassroomStatus;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface ClassroomPayload {
  branchId: string;
  name: string;
  roomNumber: string;
  capacity: number;
  equipment?: string;
  notes?: string;
  status?: ClassroomStatus;
}

export async function listClassrooms(query: ClassroomQuery) {
  const { data } = await apiClient.get<PaginatedResult<ClassroomListItem>>('/classrooms', { params: query });
  return data;
}

export async function getClassroom(id: string) {
  const { data } = await apiClient.get<ClassroomDetail>(`/classrooms/${id}`);
  return data;
}

export async function createClassroom(payload: ClassroomPayload) {
  const { data } = await apiClient.post<ClassroomDetail>('/classrooms', payload);
  return data;
}

export async function updateClassroom(id: string, payload: Partial<ClassroomPayload>) {
  const { data } = await apiClient.patch<ClassroomDetail>(`/classrooms/${id}`, payload);
  return data;
}

export async function deactivateClassroom(id: string) {
  const { data } = await apiClient.delete<ClassroomDetail>(`/classrooms/${id}`);
  return data;
}
