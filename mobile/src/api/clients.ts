import { api } from './client';
import type { Client, Compte } from '../types';

/** Le backend restreint deja la liste aux clients dont l'agent est le commercial. */
export async function listClients(params: Record<string, unknown> = {}): Promise<Client[]> {
  const all: Client[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data: body } = await api.get('/clients', {
      params: { ...params, page, per_page: 100 },
    });
    const rows: Client[] = body?.data ?? [];
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

export async function getClient(id: number): Promise<Client> {
  const { data: body } = await api.get(`/clients/${id}`);
  return body?.data;
}

export async function listComptes(clientId: number): Promise<Compte[]> {
  const { data: body } = await api.get(`/clients/${clientId}/comptes`);
  return body?.data ?? [];
}
