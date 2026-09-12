import { apiClient } from './client';
import type { EnrollmentDetail, EnrollmentListItem, EnrollmentStatus, PaginatedResult, TransferredEnrollment } from '../types';

export interface EnrollmentQuery {
  page?: number;
  pageSize?: number;
  studentId?: string;
  groupId?: string;
  courseId?: string;
  branchId?: string;
  teacherEmployeeId?: string;
  status?: EnrollmentStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateEnrollmentPayload {
  studentId: string;
  groupId: string;
  startDate?: string;
  endDate?: string;
  agreedTuition?: number;
  discountAmount?: number;
  notes?: string;
}

export interface UpdateEnrollmentPayload {
  startDate?: string;
  endDate?: string;
  agreedTuition?: number;
  discountAmount?: number;
  notes?: string;
}

export interface TransferEnrollmentPayload {
  targetGroupId: string;
  startDate?: string;
  agreedTuition?: number;
  discountAmount?: number;
  notes?: string;
}

export async function listEnrollments(query: EnrollmentQuery) {
  const { data } = await apiClient.get<PaginatedResult<EnrollmentListItem>>('/enrollments', { params: query });
  return data;
}

export async function getEnrollment(id: string) {
  const { data } = await apiClient.get<EnrollmentDetail>(`/enrollments/${id}`);
  return data;
}

export async function createEnrollment(payload: CreateEnrollmentPayload) {
  const { data } = await apiClient.post<EnrollmentDetail>('/enrollments', payload);
  return data;
}

export async function updateEnrollment(id: string, payload: UpdateEnrollmentPayload) {
  const { data } = await apiClient.patch<EnrollmentDetail>(`/enrollments/${id}`, payload);
  return data;
}

export async function cancelEnrollment(id: string) {
  const { data } = await apiClient.delete<EnrollmentDetail>(`/enrollments/${id}`);
  return data;
}

export async function activateEnrollment(id: string) {
  const { data } = await apiClient.post<EnrollmentDetail>(`/enrollments/${id}/activate`);
  return data;
}

export async function pauseEnrollment(id: string) {
  const { data } = await apiClient.post<EnrollmentDetail>(`/enrollments/${id}/pause`);
  return data;
}

export async function completeEnrollment(id: string) {
  const { data } = await apiClient.post<EnrollmentDetail>(`/enrollments/${id}/complete`);
  return data;
}

export async function cancelEnrollmentAction(id: string) {
  const { data } = await apiClient.post<EnrollmentDetail>(`/enrollments/${id}/cancel`);
  return data;
}

export async function transferEnrollment(id: string, payload: TransferEnrollmentPayload) {
  const { data } = await apiClient.post<TransferredEnrollment>(`/enrollments/${id}/transfer`, payload);
  return data;
}
