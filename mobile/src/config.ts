import Constants from 'expo-constants';

/**
 * URL de l'API. `EXPO_PUBLIC_API_URL` (fichier .env) prime, sinon on retombe sur
 * la valeur d'app.json. 10.0.2.2 est l'alias de localhost vu depuis l'emulateur Android.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://10.0.2.2:4000/api/v1';

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
