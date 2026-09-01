import type { FilterParams } from '@/types/api';

/** Plafond imposé par le backend — voir `Math.min(100, …)` dans lib/pagination.ts. */
export const MAX_PER_PAGE = 100;

/** Garde-fou : au-delà, on considère que la boucle ne converge pas. */
const MAX_PAGES = 50;

export interface PagedResult<T> {
  data: T[];
  meta?: { total?: number };
}

/**
 * Récupère la totalité d'une ressource paginée.
 *
 * Demander `per_page: 200` ne sert à rien : le backend ramène la valeur à 100 et
 * tronque silencieusement. On boucle donc page par page jusqu'à avoir tout reçu.
 */
export async function fetchAllPages<T>(
  fetcher: (params: FilterParams) => Promise<PagedResult<T>>,
  params: FilterParams = {},
): Promise<T[]> {
  const all: T[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetcher({ ...params, page, per_page: MAX_PER_PAGE });
    const batch = res.data ?? [];
    all.push(...batch);

    // Page vide : plus rien à lire, quel que soit le total annoncé.
    if (batch.length === 0) break;

    const total = res.meta?.total;
    if (typeof total === 'number' ? all.length >= total : batch.length < MAX_PER_PAGE) break;
  }

  return all;
}
