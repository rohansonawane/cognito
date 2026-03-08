import { useState, useCallback, useEffect } from 'react';
import { AuthAPI, setToken, getToken } from '../services/api';
import type { User, Workspace, AuthState } from '../types';

const STORAGE_KEY = 'cognito-enterprise-auth';

function loadPersistedState(): Partial<AuthState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persistState(state: Partial<AuthState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => {
    const persisted = loadPersistedState();
    return {
      token: persisted.token || getToken(),
      user: persisted.user || null,
      workspaces: persisted.workspaces || [],
      currentWorkspace: persisted.currentWorkspace || null,
    };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore token on mount
  useEffect(() => {
    if (state.token && !state.user) {
      setToken(state.token);
      AuthAPI.me().then(res => {
        const next: AuthState = {
          token: state.token,
          user: res.user,
          workspaces: res.workspaces,
          currentWorkspace: state.currentWorkspace || res.workspaces[0] || null,
        };
        setState(next);
        persistState(next);
      }).catch(() => {
        // Token expired — clear state
        setToken(null);
        setState({ token: null, user: null, workspaces: [], currentWorkspace: null });
        localStorage.removeItem(STORAGE_KEY);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await AuthAPI.login(email, password);
      setToken(res.token);
      const next: AuthState = {
        token: res.token,
        user: res.user,
        workspaces: res.workspaces,
        currentWorkspace: res.workspaces[0] || null,
      };
      setState(next);
      persistState(next);
      return res;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, name: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await AuthAPI.register(email, name, password);
      setToken(res.token);
      // Fetch workspaces after register
      const meRes = await AuthAPI.me();
      const next: AuthState = {
        token: res.token,
        user: res.user,
        workspaces: meRes.workspaces,
        currentWorkspace: meRes.workspaces[0] || null,
      };
      setState(next);
      persistState(next);
      return res;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Registration failed';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setState({ token: null, user: null, workspaces: [], currentWorkspace: null });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const setCurrentWorkspace = useCallback((workspace: Workspace) => {
    setState(prev => {
      const next = { ...prev, currentWorkspace: workspace };
      persistState(next);
      return next;
    });
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const res = await AuthAPI.me();
      setState(prev => {
        const next = { ...prev, workspaces: res.workspaces, user: res.user };
        persistState(next);
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  return {
    ...state,
    isAuthenticated: !!state.token && !!state.user,
    loading,
    error,
    login,
    register,
    logout,
    setCurrentWorkspace,
    refreshWorkspaces,
    clearError: () => setError(null),
  };
}
