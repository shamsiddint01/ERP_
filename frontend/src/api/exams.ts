import { apiClient } from './client';
import type { Assessment, Exam, ExamStatus, ExamType, PaginatedResult } from '../types';

export interface ExamQuery {
  page?: number;
  pageSize?: number;
  courseId?: string;
  groupId?: string;
  teacherEmployeeId?: string;
  status?: ExamStatus;
  type?: ExamType;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateExamPayload {
  title: string;
  courseId: string;
  groupId: string;
  teacherEmployeeId?: string;
  date: string;
  maxScore: number;
  passingScore: number;
  type: ExamType;
  notes?: string;
}

export interface UpdateExamPayload {
  title?: string;
  teacherEmployeeId?: string;
  date?: string;
  maxScore?: number;
  passingScore?: number;
  type?: ExamType;
  status?: ExamStatus;
  notes?: string;
}

export interface CreateAssessmentPayload {
  studentId: string;
  score: number;
  comment?: string;
}

export interface UpdateAssessmentPayload {
  score?: number;
  comment?: string;
}

export async function listExams(query: ExamQuery) {
  const { data } = await apiClient.get<PaginatedResult<Exam>>('/exams', { params: query });
  return data;
}

export async function getExam(id: string) {
  const { data } = await apiClient.get<Exam>(`/exams/${id}`);
  return data;
}

export async function createExam(payload: CreateExamPayload) {
  const { data } = await apiClient.post<Exam>('/exams', payload);
  return data;
}

export async function updateExam(id: string, payload: UpdateExamPayload) {
  const { data } = await apiClient.patch<Exam>(`/exams/${id}`, payload);
  return data;
}

export async function deleteExam(id: string) {
  const { data } = await apiClient.delete<{ id: string }>(`/exams/${id}`);
  return data;
}

export async function listExamAssessments(examId: string) {
  const { data } = await apiClient.get<Assessment[]>(`/exams/${examId}/assessments`);
  return data;
}

export async function createAssessment(examId: string, payload: CreateAssessmentPayload) {
  const { data } = await apiClient.post<Assessment>(`/exams/${examId}/assessments`, payload);
  return data;
}

export async function updateAssessment(id: string, payload: UpdateAssessmentPayload) {
  const { data } = await apiClient.patch<Assessment>(`/assessments/${id}`, payload);
  return data;
}

export async function deleteAssessment(id: string) {
  const { data } = await apiClient.delete<{ id: string }>(`/assessments/${id}`);
  return data;
}
