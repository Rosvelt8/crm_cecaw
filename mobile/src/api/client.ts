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

/**
 * Resultat d'un rafraichissement.
 *
 * La distinction est capitale : un refus du serveur signifie que la session est
 * bel et bien perimee, alors qu'une coupure reseau est passagere. Confondre les
 * deux effacait la session d'un agent des la moindre perte de couverture, en
 * pleine tournee, avec son code PIN et son suivi.
 */
type ResultatRafraichissement =
  | { etat: 'ok'; token: string }
  | { etat: 'refuse' }
  | { etat: 'reseau' };

/** Un seul rafraichissement a la fois ; les requetes concurrentes attendent le meme resultat. */
let refreshing: Promise<ResultatRafraichissement> | null = null;

async function refreshAccessToken(): Promise<ResultatRafraichissement> {
  const refresh = await getSecure('refresh');
  if (!refresh) return { etat: 'refuse' };
  try {
    // Instance nue : passer par `api` relancerait l'intercepteur en boucle.
    // `client: 'mobile'` conserve la session longue au rafraichissement, sans
    // quoi le jeton renouvele retomberait a quinze minutes.
    const { data } = await axios.post(`${API_URL}/auth/refresh`, {
      refresh_token: refresh,
      client: 'mobile',
    });
    const token: string | undefined = data?.data?.access_token ?? data?.access_token;
    if (!token) return { etat: 'refuse' };
    await setSecure('access', token);
    return { etat: 'ok', token };
  } catch (e) {
    const err = e as AxiosError;
    // Sans reponse HTTP, le serveur n'a pas refuse : le reseau a manque.
    const refuse = err.response?.status === 401 || err.response?.status === 403;
    return refuse ? { etat: 'refuse' } : { etat: 'reseau' };
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
    const resultat = await refreshing;
    refreshing = null;

    if (resultat.etat === 'reseau') {
      // Coupure passagere : on laisse l'appel echouer, l'appelant mettra sa
      // position ou son operation en file. La session reste intacte.
      return Promise.reject(error);
    }

    if (resultat.etat === 'refuse') {
      // Le serveur a bel et bien refuse : la session est perimee.
      await wipeAll();
      onSessionLost?.();
      return Promise.reject(error);
    }

    original.headers.Authorization = `Bearer ${resultat.token}`;
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
