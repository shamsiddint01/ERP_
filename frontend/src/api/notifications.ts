import { apiClient } from './client';
import type { NotificationItem, NotificationPage, NotificationQuery } from '../types';

export async function listNotifications(query: NotificationQuery = {}): Promise<NotificationPage> {
  const { data } = await apiClient.get<NotificationPage>('/notifications', { params: query });
  return data;
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

export async function markNotificationRead(id: string): Promise<NotificationItem> {
  const { data } = await apiClient.patch<NotificationItem>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  const { data } = await apiClient.patch<{ updated: number }>('/notifications/read-all');
  return data;
}

export async function deleteNotification(id: string): Promise<void> {
  await apiClient.delete(`/notifications/${id}`);
}
