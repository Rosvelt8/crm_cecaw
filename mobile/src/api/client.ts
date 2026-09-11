import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '../config';
import { getSecure, setSecure, wipeAll } from '../lib/storage';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

/**
 * Appelee quand le rafraichissement echoue : la session est morte.
 * Branchee par le store d'authentification pour ramener l'agent a l'ecran de connexion.
 */
let onSessionLost: (() => void) | null = null;
export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getSecure('access');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Un seul rafraichissement a la fois ; les requetes concurrentes attendent le meme resultat. */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = await getSecure('refresh');
  if (!refresh) return null;
  try {
    // Instance nue : passer par `api` relancerait l'intercepteur en boucle.
    // `client: 'mobile'` conserve la session longue au rafraichissement, sans
    // quoi le jeton renouvele retomberait a quinze minutes.
    const { data } = await axios.post(`${API_URL}/auth/refresh`, {
      refresh_token: refresh,
      client: 'mobile',
    });
    const token: string | undefined = data?.data?.access_token ?? data?.access_token;
    if (!token) return null;
    await setSecure('access', token);
    return token;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;
    refreshing = refreshing ?? refreshAccessToken();
    const token = await refreshing;
    refreshing = null;

    if (!token) {
      // Le backend n'emet pas de nouveau refresh token : s'il est refuse, tout est perime.
      await wipeAll();
      onSessionLost?.();
      return Promise.reject(error);
    }

    original.headers.Authorization = `Bearer ${token}`;
    return api(original);
  },
);

/** Message d'erreur exploitable pour l'agent, sans jargon technique. */
export function errorMessage(e: unknown, fallback = 'Une erreur est survenue.'): string {
  const err = e as AxiosError<{ message?: string }>;
  if (err?.message === 'Network Error' || err?.code === 'ERR_NETWORK') {
    return 'Pas de connexion. Verifiez votre reseau.';
  }
  return err?.response?.data?.message ?? fallback;
}
