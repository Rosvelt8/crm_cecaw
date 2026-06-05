import apiClient from '@/lib/axios';

export const statsService = {
  getDashboard: async () => {
    const { data: body } = await apiClient.get('/dashboard');
    return body.data;
  },

  getKpis: async (params: Record<string, unknown> = {}) => {
    const { data: body } = await apiClient.get('/stats/kpis', { params });
    return body.data;
  },

  getPerformancesIndividuelles: async (params: Record<string, unknown> = {}) => {
    const { data: body } = await apiClient.get('/stats/performances/individuelles', { params });
    return body.data ?? [];
  },

  getPerformancesEquipes: async (params: Record<string, unknown> = {}) => {
    const { data: body } = await apiClient.get('/stats/performances/equipes', { params });
    return body.data ?? [];
  },

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
