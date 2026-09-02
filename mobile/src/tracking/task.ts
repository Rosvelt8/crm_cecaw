import type * as Location from 'expo-location';
import { getItem } from '../lib/storage';
import { isWithinWorkingHours } from '../lib/workingHours';
import { sendPosition } from '../api/agents';
import { flushPositions, queuePosition } from '../lib/queue';

export const LOCATION_TASK = 'cecaw-location-tracking';

/**
 * Corps de la tâche de géolocalisation.
 *
 * Elle s'exécute hors de React : ni contexte, ni store. Tout ce dont elle a
 * besoin (identifiant de la fiche agent, jeton d'accès) est relu depuis le
 * stockage à chaque réveil.
 */
async function onLocation({ data, error }: { data: unknown; error: unknown }) {
  if (error) return;

  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  const last = locations?.[locations.length - 1];
  if (!last) return;

  // Garde-fou horaire : le système peut réveiller la tâche à toute heure.
  // Hors temps de travail, la position n'est ni transmise ni conservée.
  if (!isWithinWorkingHours()) return;

  const stored = await getItem('agentId');
  const agentId = stored ? Number(stored) : NaN;
  if (!Number.isFinite(agentId)) return;

  const { latitude, longitude } = last.coords;

  try {
    await sendPosition(agentId, latitude, longitude);
    // Le réseau est revenu : on en profite pour rejouer ce qui attendait.
    await flushPositions(agentId);
  } catch {
    await queuePosition({ latitude, longitude, at: new Date().toISOString() });
  }
}

/**
 * `expo-task-manager` résout son module natif au moment de l'import
 * (`requireNativeModule('ExpoTaskManager')`), et lève une exception quand il est
 * absent — ce qui est le cas dans Expo Go sur Android. Un import statique ferait
 * donc planter l'application au démarrage, avant tout affichage.
 *
 * On charge le module au chargement de ce fichier (la déclaration doit rester en
 * portée globale pour que le système retrouve la tâche au réveil), mais sans
 * laisser l'échec remonter : sans suivi, l'application reste pleinement
 * utilisable pour les prospects, les clients et la collecte.
 */
export const trackingAvailable: boolean = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
    TaskManager.defineTask(LOCATION_TASK, onLocation);
    return true;
  } catch {
    return false;
  }
})();
