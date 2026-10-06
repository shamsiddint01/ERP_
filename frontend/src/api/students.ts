import { apiClient } from './client';
import type { PaginatedResult, StudentAccount, StudentDetail, StudentGrades, StudentListItem, StudentProgress, StudentStatus } from '../types';

export interface StudentQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: StudentStatus;
  branchId?: string;
  from?: string;
  to?: string;
}

export interface StudentPayload {
  studentCode?: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: StudentStatus;
  source?: string;
  emergencyContact?: string;
  notes?: string;
  branchId?: string;
}

export type UpdateStudentPayload = Partial<StudentPayload>;

export async function listStudents(query: StudentQuery) {
  const { data } = await apiClient.get<PaginatedResult<StudentListItem>>('/students', { params: query });
  return data;
}

export async function getStudent(id: string) {
  const { data } = await apiClient.get<StudentDetail>(`/students/${id}`);
  return data;
}

export async function createStudent(payload: StudentPayload) {
  const { data } = await apiClient.post<StudentDetail>('/students', payload);
  return data;
}

export async function updateStudent(id: string, payload: UpdateStudentPayload) {
  const { data } = await apiClient.patch<StudentDetail>(`/students/${id}`, payload);
  return data;
}

export async function deactivateStudent(id: string) {
  const { data } = await apiClient.delete<StudentDetail>(`/students/${id}`);
  return data;
}

export async function getStudentProgress(studentId: string) {
  const { data } = await apiClient.get<StudentProgress>(`/students/${studentId}/progress`);
  return data;
}

export async function getStudentGrades(studentId: string) {
  const { data } = await apiClient.get<StudentGrades>(`/students/${studentId}/grades`);
  return data;
}

export async function getStudentAccount(studentId: string) {
  const { data } = await apiClient.get<StudentAccount | null>(`/students/${studentId}/account`);
  return data;
}

export async function createStudentAccount(studentId: string, payload: { username: string; password: string }) {
  const { data } = await apiClient.post<StudentAccount>(`/students/${studentId}/account`, payload);
  return data;
}

export async function updateStudentAccount(studentId: string, payload: { password?: string; active?: boolean }) {
  const { data } = await apiClient.patch<StudentAccount>(`/students/${studentId}/account`, payload);
  return data;
}
