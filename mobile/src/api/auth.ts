import axios from 'axios';
import { api } from './client';
import { API_URL } from '../config';
import type { User } from '../types';

/** Le backend renvoie l'utilisateur en snake_case ; le reste de l'app parle camelCase. */
function mapUser(raw: Record<string, unknown>): User {
  return {
    id: Number(raw.id),
    nom: String(raw.nom ?? ''),
    prenom: String(raw.prenom ?? ''),
    email: String(raw.email ?? ''),
    role: (raw.role ?? 'agent') as User['role'],
    fonction: (raw.fonction as string | null) ?? null,
    actif: raw.actif !== false,
    agence: (raw.agence as User['agence']) ?? null,
    equipe: (raw.equipe as User['equipe']) ?? null,
  };
}

export interface LoginResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  // Instance nue : a la connexion il n'y a pas encore de jeton a joindre.
  const { data } = await axios.post(`${API_URL}/auth/login`, { email, password });
  const payload = data?.data ?? data;
  return {
    user: mapUser(payload.user ?? payload),
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
}

export async function me(): Promise<User> {
  const { data } = await api.get('/auth/me');
  return mapUser(data?.data ?? data);
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // Une deconnexion serveur qui echoue ne doit pas empecher la purge locale.
  }
}
