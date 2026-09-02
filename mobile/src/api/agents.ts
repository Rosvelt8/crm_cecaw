import { api } from './client';
import type { Agent } from '../types';

/**
 * Retrouve la fiche agent liee au compte connecte.
 *
 * L'API ne propose pas de « mon profil agent » : `GET /agents` renvoie tous les
 * agents de l'agence (100 par page au maximum), on parcourt donc les pages
 * jusqu'a tomber sur celle dont `utilisateurId` correspond.
 */
export async function findMyAgent(utilisateurId: number): Promise<Agent | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data: body } = await api.get('/agents', { params: { page, per_page: 100 } });
    const rows: Agent[] = body?.data ?? [];
    const mine = rows.find((a) => Number(a.utilisateurId) === utilisateurId);
    if (mine) return mine;
    if (rows.length < 100) return null;
  }
  return null;
}

export async function sendPosition(
  agentId: number,
  latitude: number,
  longitude: number,
): Promise<void> {
  await api.patch(`/agents/${agentId}/position`, { latitude, longitude });
}
