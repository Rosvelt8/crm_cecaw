import apiClient from '@/lib/axios';
import { fetchAllPages } from '@/lib/fetchAll';
import type { FilterParams } from '@/types/api';

/**
 * Contrat backend (agents.controller.ts) — les corps de requête sont en snake_case,
 * alors que les réponses Prisma sont en camelCase (utilisateurId, dernierePositionAt).
 */
export interface AgentCreatePayload {
  utilisateur_id: number;
  matricule: string;
  secteur?: string;
}

export type AgentUpdatePayload = Partial<Omit<AgentCreatePayload, 'utilisateur_id'>>;

export const agentService = {
  getAgents: async (params: FilterParams = {}) => {
    const { data: body } = await apiClient.get('/agents', { params });
    return { data: body.data ?? [], meta: body.meta };
  },

  /** Toutes les pages agrégées — le backend plafonne `per_page` à 100. */
  getAllAgents: async (params: FilterParams = {}) => fetchAllPages(agentService.getAgents, params),

  getAgent: async (id: number | string) => {
    const { data: body } = await apiClient.get(`/agents/${id}`);
    return body.data;
  },

  create: async (payload: AgentCreatePayload) => {
    const { data: body } = await apiClient.post('/agents', payload);
    return body.data;
  },

  update: async (id: number | string, payload: AgentUpdatePayload) => {
    const { data: body } = await apiClient.put(`/agents/${id}`, payload);
    return body.data;
  },

  remove: async (id: number | string) => {
    await apiClient.delete(`/agents/${id}`);
  },

  /** Trajet parcouru sur une journee (YYYY-MM-DD, defaut : aujourd'hui). */
  getTrajet: async (id: number | string, date?: string) => {
    const { data: body } = await apiClient.get(`/agents/${id}/trajet`, {
      params: date ? { date } : {},
    });
    return body.data as {
      agent_id: number;
      date: string;
      nb_points: number;
      distance_km: number;
      premier_point: string | null;
      dernier_point: string | null;
      points: { latitude: number; longitude: number; releve_at: string }[];
    };
  },

  updatePosition: async (id: number | string, latitude: number, longitude: number) => {
    const { data: body } = await apiClient.patch(`/agents/${id}/position`, { latitude, longitude });
    return body.data;
  },
};
