import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TOKEN_KEYS } from '@/constants';
import type { User } from '@/types/user';
import type { AuthState } from '@/types/auth';

interface AuthStore extends AuthState {
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      access_token: null,
      refresh_token: null,
      is_authenticated: false,
      is_loading: true,

      setAuth: (user, access_token, refresh_token) => {
        localStorage.setItem(TOKEN_KEYS.access, access_token);
        localStorage.setItem(TOKEN_KEYS.refresh, refresh_token);
        set({
          user,
          access_token,
          refresh_token,
          is_authenticated: true,
          is_loading: false,
        });
      },

      setUser: (user) => set({ user }),

      setTokens: (access_token, refresh_token) => {
        localStorage.setItem(TOKEN_KEYS.access, access_token);
        localStorage.setItem(TOKEN_KEYS.refresh, refresh_token);
        set({ access_token, refresh_token });
      },

      logout: () => {
        localStorage.removeItem(TOKEN_KEYS.access);
        localStorage.removeItem(TOKEN_KEYS.refresh);
        set({
          user: null,
          access_token: null,
          refresh_token: null,
          is_authenticated: false,
          is_loading: false,
        });
      },

      setLoading: (is_loading) => set({ is_loading }),
    }),
    {
      name: 'cecaw-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        access_token: state.access_token,
        refresh_token: state.refresh_token,
        is_authenticated: state.is_authenticated,
      }),
    }
  )
);
