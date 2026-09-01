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
};
