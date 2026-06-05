export type PeriodeObjectif = 'journalier' | 'hebdomadaire' | 'mensuel' | 'trimestriel' | 'annuel';
export type StatutObjectif = 'en_cours' | 'atteint' | 'depasse' | 'non_atteint' | 'en_risque';

import type { Produit, GroupeProduit } from './produit';

export interface Objectif {
  id: number;
  titre: string;
  description?: string;
  type: 'collecte' | 'credit' | 'prospection' | 'recouvrement' | 'conversion';
  periode: PeriodeObjectif;
  valeur_cible: number;
  valeur_actuelle: number;
  unite: string;
  statut: StatutObjectif;
  agent_id?: number;
  equipe_id?: number;
  agence_id?: number;
  produit_id?: number;
  produit?: Produit;
  groupe_produit_id?: number;
  groupe_produit?: GroupeProduit;
  date_debut: string;
  date_fin: string;
  created_at: string;
}

export interface KpiDashboard {
  encours_credit_total: number;
  encours_credit_variation: number;
  total_epargne: number;
  total_epargne_variation: number;
  nb_clients_actifs: number;
  nb_clients_variation: number;
  taux_impaye: number;
  taux_impaye_variation: number;
  nb_credits_en_cours: number;
  nb_nouveaux_prospects: number;
  collecte_journaliere: number;
  objectif_collecte: number;
  taux_realisation_global: number;
}
