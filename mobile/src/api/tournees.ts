import { api } from './client';
import type { CorpsCloture, TourneeJour } from '../types';

export async function mesTournees(date?: string): Promise<TourneeJour[]> {
  const { data } = await api.get('/tournees/mes', { params: date ? { date } : undefined });
  return data?.data ?? [];
}

export async function demarrerTournee(id: number): Promise<void> {
  await api.post(`/tournees/${id}/demarrer`);
}

export async function terminerTournee(id: number): Promise<void> {
  await api.post(`/tournees/${id}/terminer`);
}

export interface ResultatArrivee {
  deja_enregistree: boolean;
  conflit?: boolean;
  presence_validee: boolean;
  distance_cible_m: number | null;
  rayon_m?: number;
  cible_localisee?: boolean;
}

export async function arriveeVisite(id: number, latitude: number, longitude: number, effectueLe?: string): Promise<ResultatArrivee> {
  const { data } = await api.post(`/tournees/visites/${id}/arrivee`, { latitude, longitude, effectue_le: effectueLe });
  return data?.data;
}

/** Envoie la photo en multipart. `uri` est un fichier local (camera). */
export async function photoVisite(id: number, uri: string, prisLe: string, latitude?: number, longitude?: number): Promise<void> {
  const form = new FormData();
  // React Native accepte cet objet a la place d'un Blob pour les fichiers locaux.
  form.append('photo', { uri, name: `visite-${id}-${Date.now()}.jpg`, type: 'image/jpeg' } as unknown as Blob);
  form.append('pris_le', prisLe);
  if (latitude != null) form.append('latitude', String(latitude));
  if (longitude != null) form.append('longitude', String(longitude));
  await api.post(`/tournees/visites/${id}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000, transformRequest: (d) => d });
}

export interface ResultatCloture {
  applique: boolean;
  conflit: boolean;
  deja_applique?: boolean;
  version: number;
  etat_serveur?: string;
}

export async function clotureVisite(id: number, corps: CorpsCloture): Promise<ResultatCloture> {
  const { data } = await api.post(`/tournees/visites/${id}/cloture`, corps);
  return data?.data;
}
