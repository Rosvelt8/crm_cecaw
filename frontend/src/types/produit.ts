// Aligné sur l'enum Prisma `TypeProduit` (backend/prisma/schema.prisma) : 'assurance' et 'service'
// n'existent pas côté serveur, un produit non financier est classé 'autre'.
export type TypeProduit = 'credit' | 'epargne' | 'autre';

export interface GroupeProduit {
  id: number;
  nom: string;
  description?: string | null;
  couleur?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Champs alignés sur la sortie réelle de GET /produits (Prisma sérialisé en camelCase, sans mapping).
// Le taux, les frais et les bornes de montant/durée ne vivent pas sur le produit lui-même mais sur son
// paramétrage versionné (voir ParametrageProduit, /parametrages/produits/:id/en-vigueur).
export interface Produit {
  id: number;
  nom: string;
  code: string | null;
  groupeId: number;
  groupe?: GroupeProduit;
  type: TypeProduit;
  description?: string | null;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

// Paramètres de requête de GET /produits. Seuls `groupe_id`, `actif` et `search` sont filtrés côté
// serveur (voir produits.service.ts `list`) ; `page`/`per_page` sont acceptés par des appelants qui
// espèrent une pagination, mais la route ne pagine pas et les ignore silencieusement.
export interface ProduitFilterParams {
  groupe_id?: number;
  actif?: boolean;
  search?: string;
  page?: number;
  per_page?: number;
}
