import apiClient from '@/lib/axios';
import { fetchAllPages } from '@/lib/fetchAll';
import type { FilterParams } from '@/types/api';

export const statsService = {
  getDashboard: async () => {
    const { data: body } = await apiClient.get('/dashboard');
    return body.data;
  },

  getKpis: async (params: Record<string, unknown> = {}) => {
    const { data: body } = await apiClient.get('/stats/kpis', { params });
    return body.data;
  },

  // Ces deux endpoints paginent (stats.service.ts) : on agrège toutes les pages,
  // sinon le classement est tronqué à 100 lignes sans le moindre signe.
  getPerformancesIndividuelles: async (params: Record<string, unknown> = {}) =>
    fetchAllPages(async (p) => {
      const { data: body } = await apiClient.get('/stats/performances/individuelles', { params: p });
      return { data: body.data ?? [], meta: body.meta };
    }, params as FilterParams),

  getPerformancesEquipes: async (params: Record<string, unknown> = {}) =>
    fetchAllPages(async (p) => {
      const { data: body } = await apiClient.get('/stats/performances/equipes', { params: p });
      return { data: body.data ?? [], meta: body.meta };
    }, params as FilterParams),

  getTransactionsParMois: async (nb_mois = 6, agence_id?: string) => {
    const params: Record<string, unknown> = { nb_mois };
    if (agence_id) params.agence_id = agence_id;
    const { data: body } = await apiClient.get('/stats/transactions/par-mois', { params });
    return body.data ?? [];
  },

  getProspectsParStatut: async (agence_id?: string) => {
    const params: Record<string, unknown> = {};
    if (agence_id) params.agence_id = agence_id;
    const { data: body } = await apiClient.get('/stats/prospects/par-statut', { params });
    return body.data ?? [];
  },
};
