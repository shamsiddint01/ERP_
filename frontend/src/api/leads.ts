import { apiClient } from './client';
import type { LeadActivityType, LeadDetail, LeadListItem, LeadStatus, PaginatedResult, StudentDetail } from '../types';

export interface LeadQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: LeadStatus;
  assignedEmployeeId?: string;
  preferredCourseId?: string;
  preferredBranchId?: string;
  source?: string;
}

export interface LeadPayload {
  fullName: string;
  phone: string;
  email?: string;
  source?: string;
  preferredCourseId?: string;
  preferredBranchId?: string;
  assignedEmployeeId?: string;
  nextFollowUpAt?: string;
  notes?: string;
}

export type UpdateLeadPayload = Partial<LeadPayload>;

export interface CreateLeadActivityPayload {
  type: LeadActivityType;
  description?: string;
  occurredAt?: string;
}

export interface ConvertLeadPayload {
  studentCode?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
}

export async function listLeads(query: LeadQuery) {
  const { data } = await apiClient.get<PaginatedResult<LeadListItem>>('/leads', { params: query });
  return data;
}

export async function getLead(id: string) {
  const { data } = await apiClient.get<LeadDetail>(`/leads/${id}`);
  return data;
}

export async function createLead(payload: LeadPayload) {
  const { data } = await apiClient.post<LeadDetail>('/leads', payload);
  return data;
}

export async function updateLead(id: string, payload: UpdateLeadPayload) {
  const { data } = await apiClient.patch<LeadDetail>(`/leads/${id}`, payload);
  return data;
}

export async function deleteLead(id: string) {
  const { data } = await apiClient.delete<{ deleted: boolean }>(`/leads/${id}`);
  return data;
}

export async function addLeadActivity(id: string, payload: CreateLeadActivityPayload) {
  const { data } = await apiClient.post<LeadDetail>(`/leads/${id}/activities`, payload);
  return data;
}

export async function removeLeadActivity(id: string, activityId: string) {
  await apiClient.delete(`/leads/${id}/activities/${activityId}`);
}

export async function changeLeadStatus(id: string, status: LeadStatus) {
  const { data } = await apiClient.patch<LeadDetail>(`/leads/${id}/status`, { status });
  return data;
}

export async function convertLead(id: string, payload: ConvertLeadPayload) {
  const { data } = await apiClient.post<StudentDetail>(`/leads/${id}/convert`, payload);
  return data;
}
