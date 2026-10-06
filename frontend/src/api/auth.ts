import { apiClient } from './client';
import type { CurrentUserProfile } from '../types';

interface LoginResponse {
  accessToken: string;
  user: { id: string; fullName: string; username: string; email: string; avatarUrl: string | null; role: string };
}

export async function login(username: string, password: string) {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', { username, password });
  return data;
}

export async function refresh() {
  const { data } = await apiClient.post<{ accessToken: string }>('/auth/refresh');
  return data;
}

export async function logout() {
  await apiClient.post('/auth/logout');
}

export async function fetchCurrentUser() {
  const { data } = await apiClient.get<CurrentUserProfile>('/auth/me');
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await apiClient.post('/auth/change-password', { currentPassword, newPassword });
}
