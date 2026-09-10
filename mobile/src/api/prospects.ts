import { api } from './client';
import type { Prospect, StatutProspect } from '../types';

/** Le backend restreint deja la liste aux prospects de l'agent connecte. */
export async function listProspects(params: Record<string, unknown> = {}): Promise<Prospect[]> {
  const all: Prospect[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data: body } = await api.get('/prospects', {
      params: { ...params, page, per_page: 100 },
    });
    const rows: Prospect[] = body?.data ?? [];
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

export async function getProspect(id: number): Promise<Prospect> {
  const { data: body } = await api.get(`/prospects/${id}`);
  return body?.data;
}

/**
 * Charge acceptee par le backend (prospects.controller.ts).
 *
 * Tout est en snake_case, contrairement aux reponses qui sont en camelCase.
 * `commercial_id` est volontairement omis : le serveur rattache le prospect a
 * l'agent connecte.
 */
export interface ProspectPayload {
  type_personne: 'physique' | 'morale';
  nom: string;
  prenom?: string;
  genre?: 'M' | 'F' | '';
  date_naissance?: string;
  lieu_naissance?: string;
  nationalite?: string;
  numero_cni?: string;
  nui?: string;
  forme_juridique?: string;
  sigle?: string;
  rccm?: string;
  capital_social?: string;
  telephone: string;
  telephone_secondaire?: string;
  email?: string;
  adresse?: string;
  quartier?: string;
  ville?: string;
  profession?: string;
  employeur?: string;
  secteur_activite?: string;
  revenu_mensuel?: string;
  situation_familiale?: 'celibataire' | 'marie' | 'divorce' | 'veuf' | '';
  nombre_enfants?: number;
  referent_nom?: string;
  referent_telephone?: string;
  referent_relation?: string;
  statut?: StatutProspect;
  produit_interet_id?: number | null;
  notes?: string;
  /** Lieu de la prise de contact, releve sur le terrain. */
  latitude?: number;
  longitude?: number;
}

export async function createProspect(payload: ProspectPayload): Promise<Prospect> {
  const { data: body } = await api.post('/prospects', payload);
  return body?.data;
}

export async function updateProspect(
  id: number,
  payload: Partial<ProspectPayload>,
): Promise<Prospect> {
  const { data: body } = await api.put(`/prospects/${id}`, payload);
  return body?.data;
}

/**
 * Le backend refuse les transitions non prevues (422). L'interface ne propose
 * donc que les statuts atteignables, voir `TRANSITIONS_PROSPECT`.
 */
export async function updateProspectStatut(id: number, statut: StatutProspect): Promise<void> {
  await api.patch(`/prospects/${id}/statut`, { statut });
}

export async function removeProspect(id: number): Promise<void> {
  await api.delete(`/prospects/${id}`);
}
