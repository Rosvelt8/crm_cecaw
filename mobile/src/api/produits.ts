import { api } from './client';
import type { Produit } from '../types';

/** L'endpoint `/produits` ne pagine pas : une seule requete suffit. */
export async function listProduits(actifsSeulement = true): Promise<Produit[]> {
  const { data: body } = await api.get('/produits', {
    params: actifsSeulement ? { actif: true } : {},
  });
  return body?.data ?? [];
}
