import { api } from './client';
import type { Objectif } from '../types';

/**
 * Pour un compte de role `agent`, le backend ne renvoie que les objectifs
 * qui lui sont assignes : aucun filtre a passer ici.
 */
export async function listMesObjectifs(): Promise<Objectif[]> {
  const all: Objectif[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data: body } = await api.get('/objectifs', { params: { page, per_page: 100 } });
    const rows: Objectif[] = body?.data ?? [];
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}
