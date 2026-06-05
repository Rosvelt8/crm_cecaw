export type CreditStatut =
  | 'brouillon'
  | 'en_attente'
  | 'en_analyse'
  | 'en_comite'
  | 'approuve'
  | 'rejete'
  | 'decaisse'
  | 'en_cours'
  | 'solde'
  | 'contentieux';

export type TypeCredit = 'individuel' | 'solidaire' | 'pme' | 'agri' | 'immobilier';
export type FrequenceRemboursement = 'hebdomadaire' | 'bimensuel' | 'mensuel' | 'trimestriel';
export type TypeGarantie = 'salaire' | 'immobilier' | 'materiel' | 'tiers_garant' | 'epargne_blocquee';

export interface Garantie {
  id: number;
  credit_id: number;
  type: TypeGarantie;
  description: string;
  valeur_estimee: number;
  document_url?: string;
}

export interface EcheanceCredit {
  id: number;
  credit_id: number;
  numero: number;
  date_echeance: string;
  montant_principal: number;
  montant_interet: number;
  montant_total: number;
  montant_paye?: number;
  statut: 'a_venir' | 'paye' | 'en_retard' | 'partiellement_paye';
  date_paiement?: string;
  penalite?: number;
}

export interface AnalyseCredit {
  id: number;
  credit_id: number;
  analyste_id: number;
  ratio_endettement: number;
  capacite_remboursement: number;
  score_risque: number;
  recommandation: 'approuver' | 'rejeter' | 'revoir';
  commentaires?: string;
  date_analyse: string;
}

export interface DecisionComite {
  id: number;
  credit_id: number;
  decideur_id: number;
  decision: 'approuve' | 'rejete' | 'ajourne';
  montant_approuve?: number;
  conditions?: string;
  commentaires?: string;
  date_decision: string;
}

export interface Credit {
  id: number;
  reference: string;
  client_id: number;
  client?: import('./client').Client;
  agent_id: number;
  agence_id: number;
  type: TypeCredit;
  statut: CreditStatut;
  montant_demande: number;
  montant_approuve?: number;
  montant_decaisse?: number;
  taux_interet: number;
  duree_mois: number;
  frequence_remboursement: FrequenceRemboursement;
  date_depot?: string;
  date_approbation?: string;
  date_decaissement?: string;
  date_echeance_finale?: string;
  objet_credit: string;
  garanties?: Garantie[];
  echeancier?: EcheanceCredit[];
  analyse?: AnalyseCredit;
  decisions_comite?: DecisionComite[];
  taux_impaye?: number;
  montant_rembourse?: number;
  solde_restant?: number;
  created_at: string;
  updated_at: string;
}

export interface DemandeCreditPayload {
  client_id: number;
  type: TypeCredit;
  montant_demande: number;
  duree_mois: number;
  frequence_remboursement: FrequenceRemboursement;
  objet_credit: string;
  garanties?: Omit<Garantie, 'id' | 'credit_id'>[];
}
