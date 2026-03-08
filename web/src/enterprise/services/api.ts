/**
 * Enterprise API client — wraps all /enterprise/* endpoints.
 */

import type { User, Workspace, EnterpriseFile, Connection, Analysis } from '../types';

const BASE = '/enterprise';

// ─── Token storage ────────────────────────────────────────────────────────────

let _token: string | null = null;

export function setToken(token: string | null) {
  _token = token;
  if (token) localStorage.setItem('cognito-enterprise-token', token);
  else localStorage.removeItem('cognito-enterprise-token');
}

export function getToken(): string | null {
  if (_token) return _token;
  _token = localStorage.getItem('cognito-enterprise-token');
  return _token;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers as Record<string, string> || {}),
    },
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data as T;
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `Upload failed: ${res.status}`);
  return data as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface RegisterResponse {
  ok: boolean;
  token: string;
  user: User;
  defaultWorkspaceId: string;
}

export interface LoginResponse {
  ok: boolean;
  token: string;
  user: User;
  workspaces: Workspace[];
}

export interface MeResponse {
  ok: boolean;
  user: User;
  workspaces: Workspace[];
}

export const AuthAPI = {
  register: (email: string, name: string, password: string) =>
    request<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    }),

  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<MeResponse>('/auth/me'),

  logout: () => request('/auth/logout', { method: 'POST' }),
};

// ─── Workspaces ───────────────────────────────────────────────────────────────

export interface WorkspaceDetailResponse {
  ok: boolean;
  workspace: Workspace;
  role: string;
  stats: { files: number; connections: number; analyses: number };
  files: EnterpriseFile[];
  connections: Connection[];
  recentAnalyses: Analysis[];
}

export const WorkspaceAPI = {
  list: () => request<{ ok: boolean; workspaces: Workspace[] }>('/workspaces'),

  create: (name: string, description?: string) =>
    request<{ ok: boolean; workspace: Workspace }>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),

  get: (id: string) => request<WorkspaceDetailResponse>(`/workspaces/${id}`),

  update: (id: string, name: string, description?: string) =>
    request<{ ok: boolean; workspace: Workspace }>(`/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description }),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/workspaces/${id}`, { method: 'DELETE' }),

  addMember: (id: string, email: string, role = 'viewer') =>
    request<{ ok: boolean; message: string }>(`/workspaces/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),
};

// ─── Files ────────────────────────────────────────────────────────────────────

export const FileAPI = {
  upload: (workspaceId: string, files: File[]) => {
    const formData = new FormData();
    formData.append('workspaceId', workspaceId);
    for (const file of files) {
      formData.append('files', file);
    }
    return upload<{ ok: boolean; files: EnterpriseFile[] }>('/files/upload', formData);
  },

  list: (workspaceId: string) =>
    request<{ ok: boolean; files: EnterpriseFile[] }>(`/files/workspace/${workspaceId}`),

  get: (id: string) =>
    request<{ ok: boolean; file: EnterpriseFile }>(`/files/${id}`),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/files/${id}`, { method: 'DELETE' }),

  downloadUrl: (id: string) => `${BASE}/files/download/${id}`,
};

// ─── Connections ──────────────────────────────────────────────────────────────

export interface AnalyzeResponse {
  ok: boolean;
  analysisId: string;
  result: string;
  filesAnalyzed: number;
  provider: string;
}

export const ConnectorAPI = {
  create: (workspaceId: string, name: string, description: string, fileIds: string[]) =>
    request<{ ok: boolean; connection: Connection }>('/connections', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, name, description, fileIds }),
    }),

  list: (workspaceId: string) =>
    request<{ ok: boolean; connections: Connection[] }>(`/connections/workspace/${workspaceId}`),

  get: (id: string) =>
    request<{ ok: boolean; connection: Connection; files: EnterpriseFile[]; analyses: Analysis[] }>(`/connections/detail/${id}`),

  update: (id: string, updates: { name?: string; description?: string; fileIds?: string[] }) =>
    request<{ ok: boolean; connection: Connection }>(`/connections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/connections/${id}`, { method: 'DELETE' }),

  analyze: (connectionId: string, prompt: string, provider: string) =>
    request<AnalyzeResponse>(`/connections/${connectionId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ prompt, provider }),
    }),

  analyzeFiles: (workspaceId: string, fileIds: string[], prompt: string, provider: string) =>
    request<AnalyzeResponse>('/connections/analyze-files', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, fileIds, prompt, provider }),
    }),
};

// ─── Analyses ─────────────────────────────────────────────────────────────────

export const AnalysisAPI = {
  list: (workspaceId: string) =>
    request<{ ok: boolean; analyses: Analysis[] }>(`/analyses/workspace/${workspaceId}`),

  get: (id: string) =>
    request<{ ok: boolean; analysis: Analysis }>(`/analyses/${id}`),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/analyses/${id}`, { method: 'DELETE' }),
};
