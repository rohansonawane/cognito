/**
 * useAuth hook tests — validates authentication state management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../enterprise/hooks/useAuth';

// Mock the API module
vi.mock('../enterprise/services/api', () => ({
  setToken: vi.fn(),
  getToken: vi.fn(() => null),
  AuthAPI: {
    login: vi.fn(),
    register: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
  },
}));

import { AuthAPI, setToken } from '../enterprise/services/api';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, v: string) => { store[key] = v; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('starts unauthenticated with no stored token', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it('login sets user and token', async () => {
    const mockUser = { id: 'u1', email: 'a@b.com', name: 'Alice', role: 'user' as const, created_at: 0 };
    const mockWs = [{ id: 'ws1', owner_id: 'u1', name: 'Alice WS', description: '', created_at: 0, updated_at: 0 }];

    vi.mocked(AuthAPI.login).mockResolvedValueOnce({
      ok: true,
      token: 'jwt-abc',
      user: mockUser,
      workspaces: mockWs,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('a@b.com', 'password');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.token).toBe('jwt-abc');
    expect(result.current.workspaces).toEqual(mockWs);
    expect(result.current.currentWorkspace).toEqual(mockWs[0]);
  });

  it('login failure sets error and keeps unauthenticated', async () => {
    vi.mocked(AuthAPI.login).mockRejectedValueOnce(new Error('Invalid credentials'));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      try { await result.current.login('a@b.com', 'wrong'); } catch { /* expected */ }
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBe('Invalid credentials');
  });

  it('register calls AuthAPI.register and AuthAPI.me', async () => {
    const mockUser = { id: 'u2', email: 'b@c.com', name: 'Bob', role: 'user' as const, created_at: 0 };
    const mockWs = [{ id: 'ws2', owner_id: 'u2', name: 'Bob WS', description: '', created_at: 0, updated_at: 0 }];

    vi.mocked(AuthAPI.register).mockResolvedValueOnce({
      ok: true,
      token: 'jwt-xyz',
      user: mockUser,
      defaultWorkspaceId: 'ws2',
    });
    vi.mocked(AuthAPI.me).mockResolvedValueOnce({
      ok: true,
      user: mockUser,
      workspaces: mockWs,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.register('b@c.com', 'Bob', 'password123');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(AuthAPI.me).toHaveBeenCalledTimes(1);
  });

  it('logout clears state', async () => {
    const mockUser = { id: 'u1', email: 'a@b.com', name: 'Alice', role: 'user' as const, created_at: 0 };
    vi.mocked(AuthAPI.login).mockResolvedValueOnce({
      ok: true,
      token: 'jwt-abc',
      user: mockUser,
      workspaces: [],
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('a@b.com', 'password');
    });
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it('setCurrentWorkspace updates currentWorkspace', async () => {
    const mockUser = { id: 'u1', email: 'a@b.com', name: 'Alice', role: 'user' as const, created_at: 0 };
    const ws1 = { id: 'ws1', owner_id: 'u1', name: 'WS1', description: '', created_at: 0, updated_at: 0 };
    const ws2 = { id: 'ws2', owner_id: 'u1', name: 'WS2', description: '', created_at: 0, updated_at: 0 };

    vi.mocked(AuthAPI.login).mockResolvedValueOnce({
      ok: true,
      token: 'jwt',
      user: mockUser,
      workspaces: [ws1, ws2],
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('a@b.com', 'pass');
    });
    expect(result.current.currentWorkspace?.id).toBe('ws1');

    act(() => {
      result.current.setCurrentWorkspace(ws2);
    });
    expect(result.current.currentWorkspace?.id).toBe('ws2');
  });
});
