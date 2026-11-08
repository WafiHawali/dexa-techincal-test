import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, errorMessage, SESSION_EXPIRED, SESSION_KEY } from './api';
import type { LoginInput, User } from './types';

interface AuthContextValue {
  user: User | null;
  restoring: boolean;
  restoreError: string | null;
  login: (input: LoginInput) => Promise<User>;
  logout: () => void;
  retry: () => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
    setRestoreError(null);
    setRestoring(false);
    queryClient.clear();
  }, [queryClient]);

  const restore = useCallback(async () => {
    if (!sessionStorage.getItem(SESSION_KEY)) { setRestoring(false); return; }
    setRestoring(true);
    setRestoreError(null);
    try {
      const current = await authApi.me();
      if (!['EMPLOYEE', 'HRD'].includes(current.role)) throw new Error('This account does not have a supported workplace role.');
      if (sessionStorage.getItem(SESSION_KEY)) setUser(current);
    } catch (error) {
      if (sessionStorage.getItem(SESSION_KEY)) setRestoreError(errorMessage(error));
    } finally { setRestoring(false); }
  }, []);

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED, logout);
    void restore();
    return () => window.removeEventListener(SESSION_EXPIRED, logout);
  }, [logout, restore]);

  async function login(input: LoginInput) {
    const result = await authApi.login(input);
    if (!['EMPLOYEE', 'HRD'].includes(result.user.role)) throw new Error('This account does not have a supported workplace role.');
    queryClient.clear();
    sessionStorage.setItem(SESSION_KEY, result.accessToken);
    setUser(result.user);
    setRestoreError(null);
    return result.user;
  }

  return <AuthContext.Provider value={{ user, restoring, restoreError, login, logout, retry: () => void restore() }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export const homeFor = (user: User) => user.role === 'HRD' ? '/hrd/dashboard' : '/employee/dashboard';
