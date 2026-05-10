import axios from "axios";
import type { CaseRecord, CaseReport } from "@/lib/types";

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000
});

export type CreateCasePayload = {
  victim_name: string;
  incident_location: string;
  incident_date: string;
  notes?: string;
};

export async function getCases() {
  const { data } = await api.get<CaseRecord[] | { cases: CaseRecord[] }>("/cases");
  return Array.isArray(data) ? data : data.cases || [];
}

export async function createCase(payload: CreateCasePayload) {
  const { data } = await api.post<CaseRecord>("/cases", payload);
  return data;
}

export async function deleteCase(caseId: string) {
  const { data } = await api.delete(`/cases/${caseId}`);
  return data;
}

export async function uploadEvidence(caseId: string, fileType: string, file: File, onProgress?: (progress: number) => void) {
  const formData = new FormData();
  formData.append("file_type", fileType);
  formData.append("file", file);
  const { data } = await api.post(`/cases/${caseId}/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (!event.total) return;
      onProgress?.(Math.round((event.loaded * 100) / event.total));
    }
  });
  return data;
}

export async function analyzeCase(caseId: string) {
  const { data } = await api.post(`/cases/${caseId}/analyze`, {
    body_temperature: 37.0,
    ambient_temperature: 20.0,
    rigor_stage: "none"
  });
  return data;
}

export async function getAnalysisResults(caseId: string) {
  const { data } = await api.get<{ status: string; case_id: string; results_ready?: boolean; message?: string }>(`/cases/${caseId}/results`);
  return data;
}

export async function getReport(caseId: string) {
  const { data } = await api.get<CaseReport>(`/cases/${caseId}/report`);
  return data;
}

export function getReportDocumentUrl(caseId: string) {
  return `${API_URL}/cases/${caseId}/report/document`;
}

export function getReportMarkdownUrl(caseId: string) {
  return `${API_URL}/cases/${caseId}/report/markdown`;
}

export type EvidenceRecord = {
  id: number;
  case_id: string;
  file_type: string;
  file_name: string;
  file_path: string;
  processed: boolean;
  uploaded_at: string;
};

export type RiskFlag = {
  id: number;
  case_id: string;
  flag_name: string;
  description: string;
  score: number;
  created_at: string;
};

export type QAMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

export async function getEvidence(caseId: string) {
  const { data } = await api.get<EvidenceRecord[]>(`/cases/${caseId}/evidence`);
  return data;
}

export async function downloadEvidence(caseId: string, fileId: number, fileName: string) {
  const response = await api.get(`/cases/${caseId}/evidence/${fileId}/download`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function deleteEvidence(caseId: string, fileId: number) {
  const { data } = await api.delete(`/cases/${caseId}/evidence/${fileId}`);
  return data;
}

export async function getRiskFlags(caseId: string) {
  const { data } = await api.get<RiskFlag[]>(`/cases/${caseId}/risk-flags`);
  return data;
}

export async function askQuestion(caseId: string, question: string) {
  const { data } = await api.post<{ answer: string; sources: string[]; advisory?: string }>(`/cases/${caseId}/qa`, { question });
  return data;
}
