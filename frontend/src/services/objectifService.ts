import apiClient from '@/lib/axios';
import { fetchAllPages } from '@/lib/fetchAll';
import type { FilterParams } from '@/types/api';

export const objectifService = {
  getObjectifs: async (params: FilterParams = {}) => {
    const { data: body } = await apiClient.get('/objectifs', { params });
    return { data: body.data ?? [], meta: body.meta };
  },

  /** Toutes les pages agrégées — le backend plafonne `per_page` à 100. */
  getAllObjectifs: async (params: FilterParams = {}) => fetchAllPages(objectifService.getObjectifs, params),

  getObjectif: async (id: number | string) => {
    const { data: body } = await apiClient.get(`/objectifs/${id}`);
    return body.data;
  },

  create: async (payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.post('/objectifs', payload);
    return body.data;
  },

  update: async (id: number | string, payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.put(`/objectifs/${id}`, payload);
    return body.data;
  },

  remove: async (id: number | string) => {
    await apiClient.delete(`/objectifs/${id}`);
  },

  getDashboard: async () => {
    const { data: body } = await apiClient.get('/dashboard');
    return body.data;
  },
};
