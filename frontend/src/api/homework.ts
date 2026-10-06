import { apiClient } from './client';
import type { HomeworkListItem, HomeworkSubmissionsView, PaginatedResult } from '../types';

export interface HomeworkPayload {
  groupId: string;
  title: string;
  description?: string;
  dueDate: string;
  maxScore?: number;
}

export async function listHomework(query: { groupId?: string; page?: number; pageSize?: number }) {
  const { data } = await apiClient.get<PaginatedResult<HomeworkListItem>>('/homework', { params: query });
  return data;
}

export async function createHomework(payload: HomeworkPayload) {
  const { data } = await apiClient.post('/homework', payload);
  return data;
}

export async function updateHomework(id: string, payload: Partial<Omit<HomeworkPayload, 'groupId'>>) {
  const { data } = await apiClient.patch(`/homework/${id}`, payload);
  return data;
}

export async function deleteHomework(id: string) {
  await apiClient.delete(`/homework/${id}`);
}

export async function getHomeworkSubmissions(id: string) {
  const { data } = await apiClient.get<HomeworkSubmissionsView>(`/homework/${id}/submissions`);
  return data;
}

export async function gradeSubmission(submissionId: string, payload: { score: number; feedback?: string }) {
  const { data } = await apiClient.patch(`/homework/submissions/${submissionId}/grade`, payload);
  return data;
}
