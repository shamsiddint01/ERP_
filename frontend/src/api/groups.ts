import { apiClient } from './client';
import type { CourseLevel, GroupDetail, GroupListItem, PaginatedResult, StudentGroupStatus } from '../types';

export interface GroupQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  courseId?: string;
  branchId?: string;
  classroomId?: string;
  teacherEmployeeId?: string;
  status?: StudentGroupStatus;
  level?: CourseLevel;
  startFrom?: string;
  startTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface GroupPayload {
  code: string;
  name: string;
  courseId: string;
  branchId: string;
  classroomId?: string;
  teacherEmployeeId?: string;
  capacity?: number;
  tuitionAmount?: number;
  level?: CourseLevel;
  startDate: string;
  endDate?: string;
  status?: StudentGroupStatus;
  notes?: string;
}

export async function listGroups(query: GroupQuery) {
  const { data } = await apiClient.get<PaginatedResult<GroupListItem>>('/groups', { params: query });
  return data;
}

export async function getGroup(id: string) {
  const { data } = await apiClient.get<GroupDetail>(`/groups/${id}`);
  return data;
}

export async function createGroup(payload: GroupPayload) {
  const { data } = await apiClient.post<GroupDetail>('/groups', payload);
  return data;
}

export async function updateGroup(id: string, payload: Partial<GroupPayload>) {
  const { data } = await apiClient.patch<GroupDetail>(`/groups/${id}`, payload);
  return data;
}

export async function deactivateGroup(id: string) {
  const { data } = await apiClient.delete<GroupDetail>(`/groups/${id}`);
  return data;
}
