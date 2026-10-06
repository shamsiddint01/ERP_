import { apiClient } from './client';
import type { PortalExams, PortalExtraLesson, PortalGroup, PortalHomework, PortalOverview, PortalPayments, PortalProgress } from '../types';

/** The logged-in student's own data — no ids in any URL, the backend always answers for the caller. */
const get = async <T>(path: string) => (await apiClient.get<T>(`/portal/${path}`)).data;

export const getPortalOverview = () => get<PortalOverview>('overview');
export const getPortalHomework = () => get<PortalHomework[]>('homework');
export const getPortalGroups = () => get<PortalGroup[]>('groups');
export const getPortalPayments = () => get<PortalPayments>('payments');
export const getPortalExams = () => get<PortalExams>('exams');
export const getPortalProgress = () => get<PortalProgress>('progress');
export const getPortalExtraLessons = () => get<PortalExtraLesson[]>('extra-lessons');

export async function submitHomework(homeworkId: string, payload: { answerText: string; link?: string }) {
  const { data } = await apiClient.put(`/portal/homework/${homeworkId}/submission`, payload);
  return data;
}

export async function registerExtraLesson(id: string) {
  const { data } = await apiClient.post(`/portal/extra-lessons/${id}/registration`);
  return data;
}

export async function cancelExtraLessonRegistration(id: string) {
  const { data } = await apiClient.delete(`/portal/extra-lessons/${id}/registration`);
  return data;
}
