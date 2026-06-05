import apiClient from '@/lib/axios';
import type { FilterParams } from '@/types/api';

export const logsService = {
  getLogs: async (params: FilterParams = {}) => {
    const { data: body } = await apiClient.get('/logs', { params });
    return { data: body.data ?? [], meta: body.meta };
  },
};
