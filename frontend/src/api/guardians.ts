import { apiClient } from './client';
import type { GuardianDetail, GuardianListItem, GuardianRelationship, GuardianStatus, PaginatedResult } from '../types';

export interface GuardianQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: GuardianStatus;
}

export interface GuardianPayload {
  fullName: string;
  phone: string;
  email?: string;
  relationshipType?: GuardianRelationship;
  address?: string;
  notes?: string;
}

export interface UpdateGuardianPayload extends Partial<GuardianPayload> {
  status?: GuardianStatus;
}

export async function listGuardians(query: GuardianQuery) {
  const { data } = await apiClient.get<PaginatedResult<GuardianListItem>>('/guardians', { params: query });
  return data;
}

export async function getGuardian(id: string) {
  const { data } = await apiClient.get<GuardianDetail>(`/guardians/${id}`);
  return data;
}

export async function createGuardian(payload: GuardianPayload) {
  const { data } = await apiClient.post<GuardianDetail>('/guardians', payload);
  return data;
}

export async function updateGuardian(id: string, payload: UpdateGuardianPayload) {
  const { data } = await apiClient.patch<GuardianDetail>(`/guardians/${id}`, payload);
  return data;
}

export async function deactivateGuardian(id: string) {
  const { data } = await apiClient.delete<GuardianDetail>(`/guardians/${id}`);
  return data;
}
