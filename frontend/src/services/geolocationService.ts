import apiClient from '@/lib/axios';

export const geolocationService = {
  getAgentsLive: async (agenceId?: number | string) => {
    const params = agenceId ? { agence_id: agenceId } : {};
    const { data: body } = await apiClient.get('/agents', { params });
    return body.data ?? [];
  },

  updatePosition: async (agentId: number | string, coords: { latitude: number; longitude: number }) => {
    const { data: body } = await apiClient.patch(`/agents/${agentId}/position`, coords);
    return body.data;
  },
};
