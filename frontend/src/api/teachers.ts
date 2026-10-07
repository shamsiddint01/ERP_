import { apiClient } from './client';
import type { IssuedLogin, PaginatedResult, LoginAccount, TeacherDetail, TeacherListItem, TeacherProfileStatus } from '../types';

export interface TeacherQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: TeacherProfileStatus;
  branchId?: string;
}

/** Creates the teacher's underlying employee record and profile in one step. */
export interface CreateTeacherPayload {
  firstName: string;
  lastName: string;
  middleName?: string;
  phone: string;
  email?: string;
  hireDate?: string;
  bio?: string;
  specialization?: string;
  qualification?: string;
  experienceYears?: number;
  status?: TeacherProfileStatus;
}

export type UpdateTeacherPayload = Partial<Omit<CreateTeacherPayload, 'hireDate'>>;

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

export async function getTeacherAccount(teacherId: string) {
  const { data } = await apiClient.get<LoginAccount | null>(`/teachers/${teacherId}/account`);
  return data;
}

/** The system assigns the login number and a random password; both come back once, to hand over. */
export async function createTeacherAccount(teacherId: string) {
  const { data } = await apiClient.post<IssuedLogin>(`/teachers/${teacherId}/account`);
  return data;
}

export async function resetTeacherPassword(teacherId: string) {
  const { data } = await apiClient.post<IssuedLogin>(`/teachers/${teacherId}/account/reset-password`);
  return data;
}

export async function setTeacherAccountActive(teacherId: string, active: boolean) {
  const { data } = await apiClient.patch<LoginAccount>(`/teachers/${teacherId}/account`, { active });
  return data;
}

/** Deletes only the login (the teacher record stays); a new one can be issued right after. */
export async function deleteTeacherAccount(teacherId: string) {
  await apiClient.delete(`/teachers/${teacherId}/account`);
}
