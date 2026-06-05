import apiClient from '@/lib/axios';
import { mapBackendUser } from '@/lib/mapUser';
import { TOKEN_KEYS } from '@/constants';
import type { LoginCredentials } from '@/types/auth';

export const authService = {
  login: async (credentials: LoginCredentials) => {
    const { data: body } = await apiClient.post('/auth/login', {
      email: credentials.email,
      password: credentials.password,
    });
    // Backend: { success, data: { access_token, refresh_token, user, ... } }
    const payload = body.data ?? body;
    return {
      access_token:  payload.access_token,
      refresh_token: payload.refresh_token,
      user:          mapBackendUser(payload.user),
      requires_mfa:  false,
    };
  },

  me: async () => {
    const { data: body } = await apiClient.get('/auth/me');
    const raw = body.data ?? body;
    return mapBackendUser(raw);
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore errors on logout — we clear tokens regardless
    }
  },

  updateMe: async (payload: { fonction?: string }) => {
    const { data: body } = await apiClient.put('/auth/me', payload);
    return mapBackendUser(body.data ?? body);
  },

  changePassword: async (payload: {
    current_password: string;
    new_password: string;
    new_password_confirmation: string;
  }) => {
    const { data: body } = await apiClient.put('/auth/me/password', payload);
    return body.data ?? body;
  },
};
