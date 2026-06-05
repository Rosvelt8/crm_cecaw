'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { authService } from '@/services/authService';
import { TOKEN_KEYS } from '@/constants';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const { setAuth, logout, setLoading } = useAuthStore();

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem(TOKEN_KEYS.access);
      const refreshToken = localStorage.getItem(TOKEN_KEYS.refresh);

      if (!token || !refreshToken) {
        setLoading(false);
        return;
      }

      try {
        const user = await authService.me();
        setAuth(user, token, refreshToken);
      } catch (error) {
        console.error('Session invalide:', error);
        logout();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount — dependencies are stable Zustand actions

  return <>{children}</>;
}
