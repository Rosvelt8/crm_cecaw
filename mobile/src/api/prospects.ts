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

export interface ProspectPayload {
  /** Obligatoire cote backend, meme si l'app ne cree que des personnes physiques. */
  type_personne: 'physique' | 'morale';
  nom: string;
  prenom?: string;
  telephone: string;
  email?: string;
  ville?: string;
  quartier?: string;
  profession?: string;
  notes?: string;
  /** Lieu de la prise de contact, releve sur le terrain. */
  latitude?: number;
  longitude?: number;
  /** Omis volontairement : le backend rattache le prospect a l'agent connecte. */
  commercial_id?: number;
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

export async function updateProspectStatut(id: number, statut: StatutProspect): Promise<void> {
  await api.patch(`/prospects/${id}/statut`, { statut });
}
