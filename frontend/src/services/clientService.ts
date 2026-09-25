import apiClient from '@/lib/axios';
import { fetchAllPages } from '@/lib/fetchAll';
import type { FilterParams } from '@/types/api';

function buildParams(params: FilterParams) {
  const p: Record<string, string | number> = {};
  if (params.page)     p.page     = params.page;
  if (params.per_page) p.per_page = params.per_page;
  if (params.search)   p.search   = params.search;
  Object.entries(params).forEach(([k, v]) => {
    if (!['page', 'per_page', 'search'].includes(k) && v !== undefined) p[k] = v as string | number;
  });
  return p;
}

export const clientService = {
  getClients: async (params: FilterParams = {}) => {
    const { data: body } = await apiClient.get('/clients', { params: buildParams(params) });
    return { data: body.data ?? [], meta: body.meta };
  },

  /** Toutes les pages agrégées — le backend plafonne `per_page` à 100. */
  getAllClients: async (params: FilterParams = {}) => fetchAllPages(clientService.getClients, params),

  getClient: async (id: number | string) => {
    const { data: body } = await apiClient.get(`/clients/${id}`);
    return body.data;
  },

  create: async (payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.post('/clients', payload);
    return body.data;
  },

  update: async (id: number | string, payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.put(`/clients/${id}`, payload);
    return body.data;
  },

  updateStatut: async (id: number | string, statut: string) => {
    const { data: body } = await apiClient.patch(`/clients/${id}/statut`, { statut });
    return body.data;
  },

  remove: async (id: number | string) => {
    await apiClient.delete(`/clients/${id}`);
  },

  getComptes: async (clientId: number | string) => {
    const { data: body } = await apiClient.get(`/clients/${clientId}/comptes`);
    return body.data ?? [];
  },

  createCompte: async (clientId: number | string, payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.post(`/clients/${clientId}/comptes`, payload);
    return body.data;
  },

  uploadPJ: async (id: number | string, file: File, intitule?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (intitule) form.append('intitule', intitule);
    const { data: body } = await apiClient.post(`/clients/${id}/pj`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return body.data;
  },

  deletePJ: async (clientId: number | string, pjId: number | string) => {
    await apiClient.delete(`/clients/${clientId}/pj/${pjId}`);
  },

  // ── Synthèse 360° (compléments stratégiques, points 11-12) ────────────────
  getSynthese: async (id: number | string) => {
    const { data: body } = await apiClient.get(`/clients/${id}/synthese`);
    return body.data as {
      credits: { id: number; reference: string; statut: string; produit: string; montant: number; date_decaissement: string | null; prochaine_echeance: { numero: number; date: string; reste: number } | null; nb_echeances_en_retard: number; montant_en_retard: number }[];
      recouvrement: { id: number; reference: string; statut: string; classe: string; jours_retard: number; montant_impaye: number; niveau_relance: number; derniere_relance: { canal: string; date: string; resultat: string | null } | null; derniere_promesse: { montant: number; date_promise: string; statut: string } | null; prochaine_action_at: string | null }[];
    };
  },

  // ── Segmentation et score (compléments stratégiques, point 1) ─────────────
  getScores: async (params: { cycle_vie?: string; page?: number; per_page?: number } = {}) => {
    const { data: body } = await apiClient.get('/clients/scores', { params });
    return { data: body.data ?? [], meta: body.meta };
  },
  recalculerScores: async () => {
    const { data: body } = await apiClient.post('/clients/scores/recalculer', {});
    return body.data as { traites: number; par_cycle: Record<string, number> };
  },

  // ── Objectifs personnels (compléments stratégiques, point 13) ─────────────
  getObjectifsPersonnels: async (clientId: number | string) => {
    const { data: body } = await apiClient.get(`/clients/${clientId}/objectifs-personnels`);
    return body.data ?? [];
  },
  creerObjectifPersonnel: async (clientId: number | string, payload: { type: string; titre: string; montant_cible?: number | null; date_cible?: string | null; compte_id?: number | null }) => {
    const { data: body } = await apiClient.post(`/clients/${clientId}/objectifs-personnels`, payload);
    return body.data;
  },
  modifierObjectifPersonnel: async (clientId: number | string, objectifId: number, payload: { titre?: string; montant_cible?: number | null; date_cible?: string | null; statut?: string }) => {
    const { data: body } = await apiClient.put(`/clients/${clientId}/objectifs-personnels/${objectifId}`, payload);
    return body.data;
  },
};
