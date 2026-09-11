import { getItem, setItem } from '../lib/storage';
import { isWithinWorkingHours } from '../lib/workingHours';
import { TRACKING_INTERVAL_MS } from '../config';

/**
 * Etat de sante du suivi.
 *
 * Android, et surtout les surcouches Xiaomi, tuent les services de fond sans
 * prevenir. Une coupure silencieuse ressemble alors exactement a un agent
 * immobile : ni lui ni le back-office ne peuvent faire la difference.
 * On horodate donc chaque envoi reussi pour rendre le silence visible.
 */

/** Au-dela de ce silence pendant les heures de service, on alerte l'agent. */
const SEUIL_ALERTE_MS = Math.max(5 * 60_000, TRACKING_INTERVAL_MS * 10);

export type Source = 'fond' | 'direct' | 'manuel';

export async function noterEnvoi(source: Source): Promise<void> {
  await setItem('dernierEnvoi', String(Date.now()));
  await setItem('dernierEnvoiSource', source);
}

export interface SanteSuivi {
  dernierEnvoi: Date | null;
  source: Source | null;
  silenceMinutes: number | null;
  /** Vrai si le suivi devrait emettre mais s'est tu depuis trop longtemps. */
  alerte: boolean;
  dansLesHeures: boolean;
}

export async function lireSante(suiviActif: boolean): Promise<SanteSuivi> {
  const [brut, source] = await Promise.all([
    getItem('dernierEnvoi'),
    getItem('dernierEnvoiSource'),
  ]);

  const horodatage = brut ? Number(brut) : NaN;
  const dernierEnvoi = Number.isFinite(horodatage) ? new Date(horodatage) : null;
  const silenceMs = dernierEnvoi ? Date.now() - dernierEnvoi.getTime() : null;
  const dansLesHeures = isWithinWorkingHours();

  return {
    dernierEnvoi,
    source: (source as Source | null) ?? null,
    silenceMinutes: silenceMs === null ? null : Math.floor(silenceMs / 60_000),
    // On n'alerte que si le suivi est cense emettre : tournee active et heures
    // de service. Hors de ce cadre, le silence est normal.
    alerte:
      suiviActif &&
      dansLesHeures &&
      (silenceMs === null || silenceMs > SEUIL_ALERTE_MS),
    dansLesHeures,
  };
}

export const SEUIL_ALERTE_MINUTES = Math.round(SEUIL_ALERTE_MS / 60_000);
