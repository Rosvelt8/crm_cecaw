import apiClient from '@/lib/axios';
import { mapBackendUser } from '@/lib/mapUser';
import type { FilterParams } from '@/types/api';
import type { CreateUserPayload, UpdateUserPayload } from '@/types/user';

function buildParams(params: FilterParams) {
  const p: Record<string, string | number> = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') p[k] = v as string | number;
  });
  return p;
}

export const userService = {
  getUsers: async (params: FilterParams = {}) => {
    const { data: body } = await apiClient.get('/utilisateurs', { params: buildParams(params) });
    return { data: (body.data ?? []).map(mapBackendUser), meta: body.meta };
  },

  getUser: async (id: number | string) => {
    const { data: body } = await apiClient.get(`/utilisateurs/${id}`);
    return mapBackendUser(body.data);
  },

  create: async (payload: CreateUserPayload) => {
    const { data: body } = await apiClient.post('/utilisateurs', {
      nom:       payload.nom,
      prenom:    payload.prenom,
      email:     payload.email,
      role:      payload.role,
      agence_id: payload.agence_id,
      equipe_id: payload.equipe_id,
      fonction:  payload.fonction,
      actif:     payload.actif ?? true,
    });
    return body.data;
  },

  update: async (id: number | string, payload: Partial<UpdateUserPayload>) => {
    const { data: body } = await apiClient.put(`/utilisateurs/${id}`, payload);
    return mapBackendUser(body.data);
  },

  toggle: async (id: number | string) => {
    const { data: body } = await apiClient.patch(`/utilisateurs/${id}/toggle`);
    return body.data;
  },

  resetPassword: async (id: number | string) => {
    const { data: body } = await apiClient.post(`/utilisateurs/${id}/reset-password`);
    return body.data;
  },

  remove: async (id: number | string) => {
    await apiClient.delete(`/utilisateurs/${id}`);
  },

  getAgences: async () => {
    const { data: body } = await apiClient.get('/agences');
    return body.data ?? [];
  },

  getEquipes: async (agenceId?: number) => {
    const params = agenceId ? { agence_id: agenceId } : {};
    const { data: body } = await apiClient.get('/equipes', { params });
    return body.data ?? [];
  },
};
