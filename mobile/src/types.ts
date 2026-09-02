export type Role = 'admin' | 'manager' | 'backoffice' | 'agent';

export interface User {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  fonction: string | null;
  actif: boolean;
  agence: { id: number; nom: string } | null;
  equipe: { id: number; nom: string } | null;
}

/** Fiche agent terrain, distincte de l'utilisateur : c'est son `id` qu'attend l'API. */
export interface Agent {
  id: number;
  utilisateurId: number;
  matricule: string;
  secteur: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  dernierePositionAt: string | null;
}

export type StatutProspect = 'nouveau' | 'en_cours' | 'converti' | 'perdu';

export interface Prospect {
  id: number;
  nom: string;
  prenom: string | null;
  telephone: string;
  email: string | null;
  ville: string | null;
  profession: string | null;
  statut: StatutProspect;
  commercialId: number | null;
  createdAt: string;
}

export interface Client {
  id: number;
  nom: string;
  prenom: string | null;
  telephone: string;
  email: string | null;
  ville: string | null;
  statut: string;
  commercialId: number | null;
  nb_comptes?: number;
}

export interface Compte {
  id: number;
  numero: string;
  solde: string | number;
  statut: string;
  produit?: { id: number; nom: string } | null;
}

export interface Transaction {
  id: number;
  type: 'credit' | 'debit';
  montant: string | number;
  motif: string | null;
  createdAt: string;
}

export interface Objectif {
  id: number;
  titre: string;
  description: string | null;
  cible: string | number;
  realise: string | number;
  pourcentage: number;
  statut: 'en_cours' | 'atteint' | 'depasse' | 'echec';
  dateDebut: string;
  dateFin: string;
  produit?: { id: number; nom: string } | null;
}

/** Position mise en file quand le reseau manque. */
export interface QueuedPosition {
  latitude: number;
  longitude: number;
  at: string;
}

/** Transaction mise en file quand le reseau manque. */
export interface QueuedTransaction {
  compteId: number;
  type: 'credit' | 'debit';
  montant: number;
  motif?: string;
  agentId: number;
  at: string;
}
