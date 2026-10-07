import { apiClient } from './client';
import type { SalaryOverview, TeacherSalaryDetail } from '../types';

/** All teachers' salary for a month ("YYYY-MM"; default: current Tashkent month). */
export async function getSalaryOverview(period?: string) {
  const { data } = await apiClient.get<SalaryOverview>('/salaries', { params: { period } });
  return data;
}

export async function getTeacherSalary(teacherEmployeeId: string, period?: string) {
  const { data } = await apiClient.get<TeacherSalaryDetail>(`/salaries/teachers/${teacherEmployeeId}`, { params: { period } });
  return data;
}

/** The signed-in teacher's own salary. */
export async function getMySalary(period?: string) {
  const { data } = await apiClient.get<TeacherSalaryDetail>('/salaries/me', { params: { period } });
  return data;
}

export async function recordSalaryPayment(payload: { teacherEmployeeId: string; period: string; amount: number; note?: string }) {
  const { data } = await apiClient.post('/salaries/payments', payload);
  return data;
}

export async function deleteSalaryPayment(id: string) {
  await apiClient.delete(`/salaries/payments/${id}`);
}
