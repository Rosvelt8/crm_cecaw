import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { LOCATION_TASK, trackingAvailable } from './task';
import { TRACKING_DISTANCE_M, TRACKING_INTERVAL_MS } from '../config';
import { startLiveTracking, stopLiveTracking } from './live';
import { noterEnvoi } from './sante';
import { getItem, setItem } from '../lib/storage';
import { sendPosition } from '../api/agents';
import { queuePosition } from '../lib/queue';
import { workingHoursLabel } from '../lib/workingHours';

export { LOCATION_TASK, trackingAvailable } from './task';
export { setLivePositionListener, isLiveTracking } from './live';
export { lireSante, SEUIL_ALERTE_MINUTES, type SanteSuivi } from './sante';

export type PermissionOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: 'foreground-denied' | 'background-denied' | 'services-off' | 'unavailable';
    };

/**
 * Demande les autorisations dans l'ordre imposé par Android et iOS :
 * la localisation en arrière-plan ne peut être demandée qu'après avoir
 * obtenu celle de premier plan.
 */
export async function requestTrackingPermissions(): Promise<PermissionOutcome> {
  // Chaque appel traverse le pont natif et peut lever selon la surcouche du
  // constructeur. Une exception non capturee ici fermait l'application.
  try {
    const servicesOn = await Location.hasServicesEnabledAsync();
    if (!servicesOn) return { ok: false, reason: 'services-off' };

    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== 'granted') return { ok: false, reason: 'foreground-denied' };

    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status !== 'granted') return { ok: false, reason: 'background-denied' };

    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function isTrackingRunning(): Promise<boolean> {
  if (!trackingAvailable) return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Démarre la remontée de position. `agentId` est mémorisé sur le disque car la
 * tâche de fond ne partage aucun état avec l'interface.
 */
export async function startTracking(agentId: number): Promise<PermissionOutcome> {
  // Expo Go sur Android n'embarque pas le suivi en arrière-plan : inutile de
  // demander des autorisations qui ne mèneront à rien.
  if (!trackingAvailable) return { ok: false, reason: 'unavailable' };

  const permission = await requestTrackingPermissions();
  if (!permission.ok) return permission;

  try {
    await setItem('agentId', String(agentId));
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  if (await isTrackingRunning()) {
    await setItem('tracking', 'on');
    await startLiveTracking(agentId).catch(() => undefined);
    return { ok: true };
  }

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      // Precision maximale : en « Balanced » (~100 m), le seuil de distance
      // n'etait quasiment jamais franchi et la tache ne se declenchait pas.
      accuracy: Location.Accuracy.High,
      timeInterval: TRACKING_INTERVAL_MS,
      distanceInterval: TRACKING_DISTANCE_M,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      // Android impose un service de premier plan visible pour tracer en continu :
      // l'agent voit donc en permanence que sa tournée est en cours.
      foregroundService: {
        notificationTitle: 'Tournée en cours',
        notificationBody: `Position transmise à Cecaw Finance (${workingHoursLabel()})`,
        notificationColor: '#0f766e',
      },
      // Pas de `deferredUpdatesInterval` : Android y regroupait les points et
      // les livrait en differe, ce qui ruinait le temps reel attendu.
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  await setItem('tracking', 'on');
  // Flux temps reel tant que l'application reste ouverte. Son echec ne doit
  // pas empecher le suivi de fond, deja demarre.
  await startLiveTracking(agentId).catch(() => undefined);
  return { ok: true };
}

/**
 * Reprend le suivi si l'agent l'avait active.
 *
 * Sans cela, le service de fond survivait a un redemarrage de l'application
 * mais le flux temps reel, lui, ne repartait jamais.
 */
export async function resumeTracking(agentId: number): Promise<void> {
  if (!(await trackingPreference())) return;
  await startTracking(agentId);
}

export async function stopTracking(): Promise<void> {
  stopLiveTracking();
  try {
    if (await isTrackingRunning()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    // Le service peut deja avoir ete tue par le systeme : la preference
    // ci-dessous doit etre enregistree quoi qu'il arrive.
  }
  await setItem('tracking', 'off');
}

/** État souhaité par l'agent, conservé entre deux lancements de l'application. */
export async function trackingPreference(): Promise<boolean> {
  return (await getItem('tracking')) === 'on';
}

/**
 * Envoi manuel de la position courante.
 *
 * Contrairement a la tache de fond, cette action est declenchee par l'agent :
 * elle ignore donc volontairement la plage horaire de travail. Elle sert aussi
 * a verifier toute la chaine (telephone vers back-office) hors heures ouvrees.
 *
 * En cas d'echec reseau la position est mise en file, comme le fait le suivi.
 */
export async function sendCurrentPosition(
  agentId: number,
): Promise<{ ok: true; queued: boolean } | { ok: false; reason: 'no-position' | 'denied' }> {
  try {
    const services = await Location.hasServicesEnabledAsync();
    if (!services) return { ok: false, reason: 'denied' };

    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return { ok: false, reason: 'denied' };
  } catch {
    return { ok: false, reason: 'denied' };
  }

  const position = await getCurrentPosition();
  if (!position) return { ok: false, reason: 'no-position' };

  const { latitude, longitude } = position.coords;
  try {
    await sendPosition(agentId, latitude, longitude);
    await noterEnvoi('manuel');
    return { ok: true, queued: false };
  } catch {
    await queuePosition({ latitude, longitude, at: new Date().toISOString() });
    return { ok: true, queued: true };
  }
}

/** Position ponctuelle : disponible partout, Expo Go compris. */
export async function getCurrentPosition(): Promise<Location.LocationObject | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    return null;
  }
}
