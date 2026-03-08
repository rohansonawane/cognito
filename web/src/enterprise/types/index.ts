// ─── Enterprise Type Definitions ─────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  created_at: number;
}

export interface Workspace {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
}

export type FileType = 'image' | 'video' | 'audio' | 'document' | 'article' | 'code' | 'blob';

export interface EnterpriseFile {
  id: string;
  workspace_id: string;
  uploader_id: string;
  name: string;
  original_name: string;
  mime_type: string;
  size: number;
  file_type: FileType;
  storage_path: string;
  url: string;
  metadata: string;
  created_at: number;
  updated_at: number;
}

export interface Connection {
  id: string;
  workspace_id: string;
  creator_id: string;
  name: string;
  description: string;
  file_ids: string[];
  files?: EnterpriseFile[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: number;
  updated_at: number;
}

export interface Analysis {
  id: string;
  workspace_id: string;
  connection_id: string | null;
  user_id: string;
  prompt: string;
  provider: 'openai' | 'gemini';
  result: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_ids: string[];
  created_at: number;
  updated_at: number;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
}

export type Provider = 'openai' | 'gemini';
