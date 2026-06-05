import apiClient from '@/lib/axios';
import type { CompteEpargne, TransactionEpargne, CollecteJournaliere } from '@/types/epargne';
import type { PaginatedResponse, FilterParams, ApiResponse } from '@/types/api';
import { buildQueryString } from '@/lib/utils';

import { MOCK_EPARGNE } from '@/lib/mockData';

export const epargneService = {
  getComptes: async (params: FilterParams = {}) => {
    const query = buildQueryString(params);
    const { data } = await apiClient.get<PaginatedResponse<CompteEpargne>>(`/epargne/comptes?${query}`);
    return data;
  },

  getTransactions: async (params: FilterParams = {}) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      data: MOCK_EPARGNE as any,
      meta: { current_page: 1, last_page: 1, per_page: 10, total: MOCK_EPARGNE.length }
    };
  },

  createTransaction: async (payload: any) => {
    const { data } = await apiClient.post<ApiResponse<TransactionEpargne>>('/epargne/transactions', payload);
    return data;
  },

  getCollecteJournaliere: async (agentId: number | string, date: string) => {
    const { data } = await apiClient.get<ApiResponse<CollecteJournaliere>>(`/epargne/collecte?agent_id=${agentId}&date=${date}`);
    return data;
  },

  validerCollecte: async (id: number | string) => {
    const { data } = await apiClient.post<ApiResponse<CollecteJournaliere>>(`/epargne/collecte/${id}/valider`);
    return data;
  },
};
