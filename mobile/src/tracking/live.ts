import * as Location from 'expo-location';
import { AppState, AppStateStatus } from 'react-native';
import { LIVE_DISTANCE_M, LIVE_INTERVAL_MS, MIN_SEND_INTERVAL_MS } from '../config';
import { isWithinWorkingHours } from '../lib/workingHours';
import { sendPosition } from '../api/agents';
import { flushPositions, queuePosition } from '../lib/queue';
import { trackingAvailable } from './task';
import { noterEnvoi } from './sante';

/**
 * Suivi temps reel pendant que l'application est ouverte.
 *
 * La tache d'arriere-plan ne suffit pas au besoin du back-office : Android la
 * reveille avec parcimonie, et un agent immobile chez un client ne produisait
 * aucun point pendant des heures. Tant que l'application est au premier plan,
 * on ecoute donc le GPS en continu et on transmet toutes les dix secondes.
 *
 * Trois garde-fous :
 *  - hors heures de service, rien n'est emis ni conserve ;
 *  - deux envois ne peuvent pas etre plus rapproches que `MIN_SEND_INTERVAL_MS` ;
 *  - un echec reseau met la position en file plutot que de la perdre.
 */

let abonnement: Location.LocationSubscription | null = null;
let abonnementAppState: { remove: () => void } | null = null;
let agentCourant: number | null = null;
let dernierEnvoi = 0;
let onPoint: ((at: string) => void) | null = null;

/** Permet a l'interface d'afficher la date du dernier point transmis. */
export function setLivePositionListener(fn: ((at: string) => void) | null) {
  onPoint = fn;
}

async function transmettre(position: Location.LocationObject) {
  try {
    await transmettreInterne(position);
  } catch {
    // Un rejet non gere dans le rappel du GPS remonterait jusqu'au pont natif.
  }
}

async function transmettreInterne(position: Location.LocationObject) {
  if (agentCourant === null) return;

  // Le systeme peut livrer des points a toute heure : on filtre ici aussi,
  // et pas seulement a l'ouverture du suivi.
  if (!isWithinWorkingHours()) return;

  const maintenant = Date.now();
  if (maintenant - dernierEnvoi < MIN_SEND_INTERVAL_MS) return;
  dernierEnvoi = maintenant;

  const { latitude, longitude } = position.coords;
  try {
    await sendPosition(agentCourant, latitude, longitude);
    await noterEnvoi('direct');
    onPoint?.(new Date().toISOString());
    // Le reseau repond : on en profite pour rejouer ce qui attendait.
    await flushPositions(agentCourant).catch(() => undefined);
  } catch {
    await queuePosition({ latitude, longitude, at: new Date().toISOString() });
  }
}

async function ouvrirFlux() {
  if (abonnement || agentCourant === null) return;
  try {
    abonnement = await Location.watchPositionAsync(
      {
        // Precision maximale : c'est le mode temps reel, l'agent a son
        // telephone en main et la consommation reste bornee par les heures.
        accuracy: Location.Accuracy.High,
        timeInterval: LIVE_INTERVAL_MS,
        distanceInterval: LIVE_DISTANCE_M,
      },
      transmettre,
    );
  } catch {
    abonnement = null;
  }
}

function fermerFlux() {
  try {
    abonnement?.remove();
  } catch {
    // L'abonnement peut deja avoir ete invalide par le systeme.
  }
  abonnement = null;
}

/**
 * Demarre le suivi temps reel pour cet agent.
 *
 * Le flux se ferme automatiquement quand l'application passe en arriere-plan :
 * la tache de fond prend alors le relais, et on evite de tenir le GPS ouvert
 * pour rien.
 */
export async function startLiveTracking(agentId: number): Promise<void> {
  if (!trackingAvailable) return;

  let accordee = false;
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    accordee = permission.status === 'granted';
  } catch {
    accordee = false;
  }
  if (!accordee) return;

  agentCourant = agentId;
  await ouvrirFlux();

  abonnementAppState?.remove();
  abonnementAppState = AppState.addEventListener('change', (etat: AppStateStatus) => {
    if (etat === 'active') ouvrirFlux().catch(() => undefined);
    else fermerFlux();
  });
}

export function stopLiveTracking(): void {
  fermerFlux();
  abonnementAppState?.remove();
  abonnementAppState = null;
  agentCourant = null;
  dernierEnvoi = 0;
}

export function isLiveTracking(): boolean {
  return abonnement !== null;
}
