import apiClient from '@/lib/axios';
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

export const prospectService = {
  getProspects: async (params: FilterParams = {}) => {
    const { data: body } = await apiClient.get('/prospects', { params: buildParams(params) });
    return { data: body.data ?? [], meta: body.meta };
  },

  getProspect: async (id: number | string) => {
    const { data: body } = await apiClient.get(`/prospects/${id}`);
    return body.data;
  },

  create: async (payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.post('/prospects', payload);
    return body.data;
  },

  update: async (id: number | string, payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.put(`/prospects/${id}`, payload);
    return body.data;
  },

  updateStatut: async (id: number | string, statut: string) => {
    const { data: body } = await apiClient.patch(`/prospects/${id}/statut`, { statut });
    return body.data;
  },

  remove: async (id: number | string) => {
    await apiClient.delete(`/prospects/${id}`);
  },

  uploadPJ: async (id: number | string, file: File, intitule?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (intitule) form.append('intitule', intitule);
    const { data: body } = await apiClient.post(`/prospects/${id}/pj`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return body.data;
  },

  deletePJ: async (prospectId: number | string, pjId: number | string) => {
    await apiClient.delete(`/prospects/${prospectId}/pj/${pjId}`);
  },
};
