import apiClient from '@/lib/axios';
import type { FilterParams } from '@/types/api';

export const agenceService = {
  getAgences: async (params: FilterParams = {}) => {
    const { data: body } = await apiClient.get('/agences', { params });
    return { data: body.data ?? [], meta: body.meta };
  },

  getAgence: async (id: number | string) => {
    const { data: body } = await apiClient.get(`/agences/${id}`);
    return body.data;
  },

  create: async (payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.post('/agences', payload);
    return body.data;
  },

  update: async (id: number | string, payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.put(`/agences/${id}`, payload);
    return body.data;
  },

  remove: async (id: number | string) => {
    await apiClient.delete(`/agences/${id}`);
  },
};
