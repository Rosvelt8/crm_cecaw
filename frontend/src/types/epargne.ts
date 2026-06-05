export type TypeCompteEpargne = 'ordinaire' | 'dat' | 'plan_epargne' | 'tontine';
export type StatutCompteEpargne = 'actif' | 'bloque' | 'cloture' | 'en_attente';
export type TypeTransaction = 'depot' | 'retrait' | 'interet' | 'frais' | 'virement';

export interface CompteEpargne {
  id: number;
  numero: string;
  client_id: number;
  agence_id: number;
  type: TypeCompteEpargne;
  statut: StatutCompteEpargne;
  solde: number;
  solde_bloque?: number;
  taux_interet?: number;
  date_echeance_dat?: string;
  montant_minimum?: number;
  agent_collecteur_id?: number;
  date_ouverture: string;
  date_cloture?: string;
  created_at: string;
}

export interface TransactionEpargne {
  id: number;
  compte_id: number;
  agent_id: number;
  type: TypeTransaction;
  montant: number;
  solde_avant: number;
  solde_apres: number;
  reference?: string;
  notes?: string;
  date_transaction: string;
  created_at: string;
}

export interface CollecteJournaliere {
  id: number;
  agent_id: number;
  agence_id: number;
  date_collecte: string;
  montant_total: number;
  nombre_transactions: number;
  transactions: TransactionEpargne[];
  statut: 'en_cours' | 'valide' | 'verse';
}
