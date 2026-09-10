import apiClient from '@/lib/axios';
import type { FilterParams } from '@/types/api';

export const compteService = {
  getCompte: async (id: number | string) => {
    const { data: body } = await apiClient.get(`/comptes/${id}`);
    return body.data;
  },

  /**
   * Depot ou retrait.
   *
   * Il n'existe pas d'endpoint `/depot` ni `/retrait` : les deux passent par
   * la meme ecriture, distinguee par `type`. `agent_id` designe l'agent
   * collecteur ; la colonne est non nulle en base et sert de piste d'audit,
   * le back-office doit donc toujours preciser au nom de qui l'operation est
   * enregistree.
   */
  transaction: async (
    id: number | string,
    payload: { type: 'credit' | 'debit'; montant: number; motif?: string; agent_id: number },
  ) => {
    const { data: body } = await apiClient.post(`/comptes/${id}/transactions`, payload);
    return body.data;
  },

  /**
   * Seule modification exposee par le backend : le statut du compte.
   * `PUT /comptes/:id` n'existe pas et renvoyait 404.
   */
  updateStatut: async (id: number | string, statut: string) => {
    const { data: body } = await apiClient.patch(`/comptes/${id}/statut`, { statut });
    return body.data;
  },

  /** Refuse par le backend (409) si le compte porte des ecritures ou un solde. */
  remove: async (id: number | string) => {
    await apiClient.delete(`/comptes/${id}`);
  },

  getTransactions: async (id: number | string, params: FilterParams = {}) => {
    const { data: body } = await apiClient.get(`/comptes/${id}/transactions`, { params });
    return { data: body.data ?? [], meta: body.meta };
  },
};
