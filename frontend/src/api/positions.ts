import { apiClient } from './client';
import type { PaginatedResult, PositionItem, PositionStatus } from '../types';

export interface PositionQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  departmentId?: string;
  status?: PositionStatus;
}

export interface CreatePositionPayload {
  title: string;
  code: string;
  description?: string;
  departmentId: string;
}

export interface UpdatePositionPayload {
  title?: string;
  description?: string;
  departmentId?: string;
  status?: PositionStatus;
}

export async function listPositions(query: PositionQuery) {
  const { data } = await apiClient.get<PaginatedResult<PositionItem>>('/positions', { params: query });
  return data;
}

export async function createPosition(payload: CreatePositionPayload) {
  const { data } = await apiClient.post<PositionItem>('/positions', payload);
  return data;
}

export async function updatePosition(id: string, payload: UpdatePositionPayload) {
  const { data } = await apiClient.patch<PositionItem>(`/positions/${id}`, payload);
  return data;
}

export async function deactivatePosition(id: string) {
  const { data } = await apiClient.delete<PositionItem>(`/positions/${id}`);
  return data;
}
