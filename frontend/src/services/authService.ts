import apiClient from '@/lib/axios';
import { mapBackendUser } from '@/lib/mapUser';
import { TOKEN_KEYS } from '@/constants';
import type { LoginCredentials } from '@/types/auth';

export const authService = {
  /**
   * Première étape. Si l'utilisateur a activé la double authentification, aucune session n'est
   * ouverte : la réponse porte un jeton temporaire à échanger avec le code (`verifierMfa`).
   */
  login: async (credentials: LoginCredentials) => {
    const { data: body } = await apiClient.post('/auth/login', {
      email: credentials.email,
      password: credentials.password,
    });
    const payload = body.data ?? body;
    if (payload.mfa_required) {
      return { requires_mfa: true as const, mfa_token: payload.mfa_token as string };
    }
    return {
      requires_mfa: false as const,
      access_token:  payload.access_token as string,
      refresh_token: payload.refresh_token as string,
      user:          mapBackendUser(payload.user),
      mfa_configuration_requise: Boolean(payload.mfa_configuration_requise),
    };
  },

  verifierMfa: async (mfa_token: string, code: string) => {
    const { data: body } = await apiClient.post('/auth/mfa/verifier', { mfa_token, code });
    const payload = body.data ?? body;
    return {
      access_token:  payload.access_token as string,
      refresh_token: payload.refresh_token as string,
      user:          mapBackendUser(payload.user),
    };
  },

  mfaPreparer: async () => {
    const { data: body } = await apiClient.post('/auth/mfa/preparer');
    return (body.data ?? body) as { secret: string; otpauth_url: string };
  },
  mfaActiver: async (code: string) => { await apiClient.post('/auth/mfa/activer', { code }); },
  mfaDesactiver: async (mot_de_passe: string, code: string) => { await apiClient.post('/auth/mfa/desactiver', { mot_de_passe, code }); },

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
