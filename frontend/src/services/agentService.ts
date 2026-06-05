import apiClient from '@/lib/axios';
import type { FilterParams } from '@/types/api';

export const agentService = {
  getAgents: async (params: FilterParams = {}) => {
    const { data: body } = await apiClient.get('/agents', { params });
    return { data: body.data ?? [], meta: body.meta };
  },

  getAgent: async (id: number | string) => {
    const { data: body } = await apiClient.get(`/agents/${id}`);
    return body.data;
  },

  create: async (payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.post('/agents', payload);
    return body.data;
  },

  update: async (id: number | string, payload: Record<string, unknown>) => {
    const { data: body } = await apiClient.put(`/agents/${id}`, payload);
    return body.data;
  },

  remove: async (id: number | string) => {
    await apiClient.delete(`/agents/${id}`);
  },

  updatePosition: async (id: number | string, latitude: number, longitude: number) => {
    const { data: body } = await apiClient.patch(`/agents/${id}/position`, { latitude, longitude });
    return body.data;
  },
};
