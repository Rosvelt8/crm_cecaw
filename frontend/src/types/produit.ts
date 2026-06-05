export type TypeProduit = 'credit' | 'epargne' | 'assurance' | 'service';

export interface GroupeProduit {
  id: number;
  code: string;
  nom: string;
  description?: string;
  est_actif: boolean;
  created_at: string;
  updated_at: string;
  produits_count?: number;
}

export interface Produit {
  id: number;
  groupe_id?: number;
  groupe?: GroupeProduit;
  code: string;
  nom: string;
  type: TypeProduit;
  description?: string;
  est_actif: boolean;
  taux_interet_defaut?: number;
  montant_min?: number;
  montant_max?: number;
  duree_min_mois?: number;
  duree_max_mois?: number;
  created_at: string;
  updated_at: string;
}

export interface ProduitFilterParams {
  type?: TypeProduit;
  groupe_id?: number;
  est_actif?: boolean;
  search?: string;
}
