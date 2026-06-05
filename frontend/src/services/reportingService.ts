import apiClient from '@/lib/axios';
import type { FiltreRapport, RapportGenere } from '@/types/reporting';
import type { ApiResponse } from '@/types/api';

export const reportingService = {
  genererRapport: async (filtres: FiltreRapport) => {
    const { data } = await apiClient.post<ApiResponse<RapportGenere>>('/reporting/generer', filtres);
    return data;
  },

  getRapportsHistorique: async () => {
    const { data } = await apiClient.get<ApiResponse<RapportGenere[]>>('/reporting/historique');
    return data;
  },

  exporterDonnees: async (type: string, filtres: any) => {
    const { data } = await apiClient.post('/reporting/exporter', { type, ...filtres }, {
      responseType: 'blob',
    });
    return data;
  },
};
