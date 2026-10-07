import { apiClient } from './client';
import type { IssuedLogin, LoginAccount, UserListItem } from '../types';

export async function listUsers() {
  const { data } = await apiClient.get<UserListItem[]>('/users');
  return data;
}

/** Admin-only: the login's current password (null only if no readable copy exists). Each call is audited. */
export async function getUserCredentials(userId: string) {
  const { data } = await apiClient.get<{ userId: string; username: string; password: string | null }>(`/users/${userId}/credentials`);
  return data;
}

export async function resetUserPassword(userId: string) {
  const { data } = await apiClient.post<IssuedLogin>(`/users/${userId}/reset-password`);
  return data;
}

export async function setUserActive(userId: string, active: boolean) {
  const { data } = await apiClient.patch<LoginAccount>(`/users/${userId}/login`, { active });
  return data;
}
