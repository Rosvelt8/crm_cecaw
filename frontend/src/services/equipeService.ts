import apiClient from '@/lib/axios';
import type { FilterParams } from '@/types/api';

export const equipeService = {
  getEquipes: async (params: FilterParams = {}) => {
    const { data: body } = await apiClient.get('/equipes', { params });
    return { data: body.data ?? [], meta: body.meta };
  },

  getEquipe: async (id: number | string) => {
    const { data: body } = await apiClient.get(`/equipes/${id}`);
    return body.data;
  },

  create: async (payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.post('/equipes', payload);
    return body.data;
  },

  update: async (id: number | string, payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.put(`/equipes/${id}`, payload);
    return body.data;
  },

  remove: async (id: number | string) => {
    await apiClient.delete(`/equipes/${id}`);
  },
};
