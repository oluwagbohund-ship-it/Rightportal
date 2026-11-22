import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.ts';
import type { AuthUser } from '../types/app.ts';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refreshSession: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  rotateSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const res = await apiRequest<{ authenticated: boolean; user: AuthUser | null }>(
        '/api/auth/session',
      );
      setUser(res.authenticated ? res.user : null);
      return res.authenticated ? res.user : null;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout-all', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const rotateSession = useCallback(async (): Promise<boolean> => {
    try {
      await apiRequest('/api/auth/rotate', { method: 'POST' });
      await refreshSession();
      return true;
    } catch {
      return false;
    }
  }, [refreshSession]);

  return (
    <AuthContext.Provider
      value={{ user, loading, refreshSession, logout, logoutAll, rotateSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
