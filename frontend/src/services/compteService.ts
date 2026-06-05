import apiClient from '@/lib/axios';
import type { FilterParams } from '@/types/api';

export const compteService = {
  getComptes: async (params: FilterParams = {}) => {
    const { data: body } = await apiClient.get('/comptes', { params });
    return { data: body.data ?? [], meta: body.meta };
  },

  getCompte: async (id: number | string) => {
    const { data: body } = await apiClient.get(`/comptes/${id}`);
    return body.data;
  },

  depot: async (id: number | string, payload: { montant: number; description?: string }) => {
    const { data: body } = await apiClient.post(`/comptes/${id}/depot`, payload);
    return body.data;
  },

  retrait: async (id: number | string, payload: { montant: number; description?: string }) => {
    const { data: body } = await apiClient.post(`/comptes/${id}/retrait`, payload);
    return body.data;
  },

  update: async (id: number | string, payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.put(`/comptes/${id}`, payload);
    return body.data;
  },

  remove: async (id: number | string) => {
    await apiClient.delete(`/comptes/${id}`);
  },

  getTransactions: async (id: number | string, params: FilterParams = {}) => {
    const { data: body } = await apiClient.get(`/comptes/${id}/transactions`, { params });
    return { data: body.data ?? [], meta: body.meta };
  },
};
