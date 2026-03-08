/**
 * Enterprise API service unit tests.
 * Tests the client-side API wrapper functions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setToken, getToken, AuthAPI, WorkspaceAPI, FileAPI, ConnectorAPI, AnalysisAPI } from '../enterprise/services/api';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

function mockResponse(data: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response);
}

describe('Token management', () => {
  beforeEach(() => {
    localStorageMock.clear();
    setToken(null); // reset module-level cache between tests
  });

  it('stores token in localStorage', () => {
    setToken('test-token-123');
    expect(localStorage.getItem('cognito-enterprise-token')).toBe('test-token-123');
  });

  it('retrieves stored token', () => {
    localStorage.setItem('cognito-enterprise-token', 'stored-token');
    expect(getToken()).toBe('stored-token');
  });

  it('clears token when set to null', () => {
    setToken('some-token');
    setToken(null);
    expect(localStorage.getItem('cognito-enterprise-token')).toBeNull();
  });
});

describe('AuthAPI', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorageMock.clear();
  });

  it('calls register endpoint with correct body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      ok: true,
      token: 'jwt-token',
      user: { id: '1', email: 'test@test.com', name: 'Test User', role: 'user', created_at: 0 },
      defaultWorkspaceId: 'ws-1',
    }));

    const result = await AuthAPI.register('test@test.com', 'Test User', 'password123');
    expect(mockFetch).toHaveBeenCalledWith(
      '/enterprise/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@test.com', name: 'Test User', password: 'password123' }),
      })
    );
    expect(result.token).toBe('jwt-token');
  });

  it('calls login endpoint with correct body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      ok: true,
      token: 'jwt-token',
      user: { id: '1', email: 'test@test.com', name: 'Test', role: 'user', created_at: 0 },
      workspaces: [],
    }));

    await AuthAPI.login('test@test.com', 'password123');
    expect(mockFetch).toHaveBeenCalledWith(
      '/enterprise/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
      })
    );
  });

  it('calls /me endpoint with auth header', async () => {
    setToken('my-token');
    mockFetch.mockResolvedValueOnce(mockResponse({
      ok: true,
      user: { id: '1', email: 'a@b.com', name: 'A', role: 'user', created_at: 0 },
      workspaces: [],
    }));

    await AuthAPI.me();
    expect(mockFetch).toHaveBeenCalledWith(
      '/enterprise/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
      })
    );
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: false, error: 'Invalid credentials' }, false, 401));
    await expect(AuthAPI.login('a@b.com', 'wrong')).rejects.toThrow('Invalid credentials');
  });
});

describe('WorkspaceAPI', () => {
  beforeEach(() => mockFetch.mockReset());

  it('creates workspace with correct body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      ok: true,
      workspace: { id: 'ws-1', name: 'Test WS', description: '', owner_id: 'u1', created_at: 0, updated_at: 0 },
    }));

    await WorkspaceAPI.create('Test WS', 'A description');
    expect(mockFetch).toHaveBeenCalledWith(
      '/enterprise/workspaces',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Test WS', description: 'A description' }),
      })
    );
  });

  it('deletes workspace by id', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));
    await WorkspaceAPI.delete('ws-123');
    expect(mockFetch).toHaveBeenCalledWith(
      '/enterprise/workspaces/ws-123',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('ConnectorAPI', () => {
  beforeEach(() => mockFetch.mockReset());

  it('creates connection with fileIds', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      ok: true,
      connection: { id: 'c1', workspace_id: 'ws1', name: 'Test Conn', file_ids: ['f1', 'f2'], status: 'pending', created_at: 0, updated_at: 0 },
    }));

    await ConnectorAPI.create('ws1', 'Test Conn', 'desc', ['f1', 'f2']);
    expect(mockFetch).toHaveBeenCalledWith(
      '/enterprise/connections',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workspaceId: 'ws1', name: 'Test Conn', description: 'desc', fileIds: ['f1', 'f2'] }),
      })
    );
  });

  it('calls analyze endpoint correctly', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      ok: true,
      analysisId: 'a1',
      result: 'Analysis result',
      filesAnalyzed: 2,
      provider: 'gemini',
    }));

    const result = await ConnectorAPI.analyze('c1', 'Analyze these files', 'gemini');
    expect(result.result).toBe('Analysis result');
    expect(mockFetch).toHaveBeenCalledWith(
      '/enterprise/connections/c1/analyze',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'Analyze these files', provider: 'gemini' }),
      })
    );
  });
});

describe('FileAPI downloadUrl', () => {
  it('returns correct download URL', () => {
    const url = FileAPI.downloadUrl('file-123');
    expect(url).toBe('/enterprise/files/download/file-123');
  });
});
