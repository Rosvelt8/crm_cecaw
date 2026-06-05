import apiClient from '@/lib/axios';
import type { ProduitFilterParams } from '@/types/produit';

export const produitService = {
  getProduits: async (params: ProduitFilterParams = {}) => {
    const { data: body } = await apiClient.get('/produits', { params });
    return { data: body.data ?? [], meta: body.meta };
  },

  getProduit: async (id: number) => {
    const { data: body } = await apiClient.get(`/produits/${id}`);
    return body.data;
  },

  createProduit: async (payload: object) => {
    const { data: body } = await apiClient.post('/produits', payload);
    return body.data;
  },

  updateProduit: async (id: number, payload: object) => {
    const { data: body } = await apiClient.put(`/produits/${id}`, payload);
    return body.data;
  },

  deleteProduit: async (id: number) => {
    await apiClient.delete(`/produits/${id}`);
  },

  getGroupesProduits: async () => {
    const { data: body } = await apiClient.get('/groupes-produits');
    return { data: body.data ?? [] };
  },

  createGroupeProduit: async (payload: object) => {
    const { data: body } = await apiClient.post('/groupes-produits', payload);
    return { data: body.data };
  },

  updateGroupeProduit: async (id: number, payload: object) => {
    const { data: body } = await apiClient.put(`/groupes-produits/${id}`, payload);
    return { data: body.data };
  },

  deleteGroupeProduit: async (id: number) => {
    await apiClient.delete(`/groupes-produits/${id}`);
  },
};
