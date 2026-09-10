import Constants from 'expo-constants';

/** Port sur lequel le backend ecoute. */
const API_PORT = 4000;

/**
 * Adresse du poste de developpement, deduite de celle de Metro.
 *
 * `hostUri` vaut par exemple « 192.168.1.9:8090 » en Wi-Fi, ou
 * « localhost:8090 » quand le telephone passe par le cable (adb reverse).
 * Dans les deux cas, le backend se trouve sur le meme hote, port 4000 : on
 * evite ainsi de coder une adresse en dur, qui change a chaque bail DHCP.
 */
function inferredApiUrl(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:${API_PORT}/api/v1` : null;
}

/**
 * URL de l'API.
 *
 * L'adresse deduite passe en premier : c'est la seule qui reste juste quand
 * l'IP du poste change ou qu'on alterne cable et Wi-Fi. `EXPO_PUBLIC_API_URL`
 * sert de repli, notamment pour une version installee ou l'adresse de Metro
 * n'existe plus.
 */
export const API_URL: string =
  inferredApiUrl() ??
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  `http://10.0.2.2:${API_PORT}/api/v1`;

/** Seul ce role peut se connecter : l'application est reservee aux agents terrain. */
export const ALLOWED_ROLE = 'agent';

/** Delais de verrouillage automatique proposes a l'agent, en minutes. */
export const LOCK_DELAY_CHOICES = [1, 2, 5, 15] as const;

/** Delai retenu par defaut si l'agent n'en choisit pas. */
export const DEFAULT_LOCK_DELAY_MIN = 2;

/** Longueur imposee du code PIN. */
export const PIN_LENGTH = 4;

/** Nombre d'essais avant purge complete des donnees locales (telephone vole ou perdu). */
export const MAX_PIN_ATTEMPTS = 5;

/** Plage horaire par defaut du tracking, en heures locales. */
export const WORKING_HOURS = { start: 7, end: 18 };

/** Jours travailles (0 = dimanche). Lundi a samedi. */
export const WORKING_DAYS = [1, 2, 3, 4, 5, 6];

/** Cadence d'envoi de la position en arriere-plan. */
export const TRACKING_INTERVAL_MS = 60_000;

/** Distance minimale, en metres, avant un nouvel envoi. */
export const TRACKING_DISTANCE_M = 50;
