/**
 * Detection des agents dont le suivi s'est tu.
 *
 * Android, et surtout les surcouches Xiaomi, tuent les services de fond sans
 * prevenir. Cote back-office, une coupure silencieuse ressemble exactement a
 * un agent immobile : meme derniere position, meme absence de mouvement. On
 * distingue donc les deux par la fraicheur du dernier releve.
 */

/** Plage de service, alignee sur celle de l'application mobile. */
export const HEURES_SERVICE = { debut: 7, fin: 18 };
export const JOURS_SERVICE = [1, 2, 3, 4, 5, 6];

/** Au-dela de ce silence pendant le service, l'agent est signale. */
export const SEUIL_SILENCE_MIN = 20;

export function enHeuresDeService(date = new Date()): boolean {
  if (!JOURS_SERVICE.includes(date.getDay())) return false;
  const h = date.getHours();
  return h >= HEURES_SERVICE.debut && h < HEURES_SERVICE.fin;
}

export type NiveauSilence = 'actif' | 'silencieux' | 'absent';

/**
 * Qualifie l'etat d'un agent :
 *  - actif      : a transmis recemment
 *  - silencieux : a transmis aujourd'hui, mais plus rien depuis le seuil
 *  - absent     : rien du tout aujourd'hui
 */
export function niveauSilence(
  minutesAgo: number | null,
  dernierePositionAt: string | null,
): NiveauSilence {
  if (minutesAgo === null || dernierePositionAt === null) return 'absent';

  const debutDuJour = new Date();
  debutDuJour.setHours(0, 0, 0, 0);
  if (new Date(dernierePositionAt) < debutDuJour) return 'absent';

  return minutesAgo > SEUIL_SILENCE_MIN ? 'silencieux' : 'actif';
}
