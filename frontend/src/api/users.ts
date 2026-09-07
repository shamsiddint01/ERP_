import { apiClient } from './client';
import type { UserListItem } from '../types';

export interface CreateUserPayload {
  fullName: string;
  email: string;
  phone?: string;
  username: string;
  password: string;
  roleId: string;
}

export interface UpdateUserPayload {
  fullName?: string;
  email?: string;
  phone?: string;
  roleId?: string;
  status?: string;
  password?: string;
}

export async function listUsers() {
  const { data } = await apiClient.get<UserListItem[]>('/users');
  return data;
}

export async function createUser(payload: CreateUserPayload) {
  const { data } = await apiClient.post<UserListItem>('/users', payload);
  return data;
}

export async function updateUser(id: string, payload: UpdateUserPayload) {
  const { data } = await apiClient.patch<UserListItem>(`/users/${id}`, payload);
  return data;
}

export async function deactivateUser(id: string) {
  const { data } = await apiClient.delete<UserListItem>(`/users/${id}`);
  return data;
}
