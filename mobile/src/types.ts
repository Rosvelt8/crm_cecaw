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

/** Valeurs exactes de l'enum Prisma `StatutProspect`. */
export type StatutProspect =
  | 'nouveau'
  | 'contacte'
  | 'interesse'
  | 'negocie'
  | 'converti'
  | 'perdu';

export type TypePersonne = 'physique' | 'morale';
export type Genre = 'M' | 'F' | '';
export type SituationFamiliale = 'celibataire' | 'marie' | 'divorce' | 'veuf' | '';
export type StatutClient = 'actif' | 'inactif' | 'blackliste';

/**
 * Transitions autorisees par le backend (prospects.service.ts).
 * L'application ne propose que les statuts atteignables, plutot que de laisser
 * l'agent decouvrir le refus apres coup.
 */
export const TRANSITIONS_PROSPECT: Record<StatutProspect, StatutProspect[]> = {
  nouveau: ['contacte', 'interesse', 'negocie', 'converti', 'perdu'],
  contacte: ['interesse', 'negocie', 'converti', 'perdu'],
  interesse: ['negocie', 'converti', 'perdu'],
  negocie: ['converti', 'perdu'],
  converti: [],
  perdu: ['nouveau'],
};

export const LABEL_STATUT_PROSPECT: Record<StatutProspect, string> = {
  nouveau: 'Nouveau',
  contacte: 'Contacté',
  interesse: 'Intéressé',
  negocie: 'En négociation',
  converti: 'Converti',
  perdu: 'Perdu',
};

export interface Prospect {
  id: number;
  typePersonne: TypePersonne;
  nom: string;
  prenom: string | null;
  genre: Genre | null;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  nationalite: string | null;
  numeroCni: string | null;
  nui: string | null;
  sigle: string | null;
  formeJuridique: string | null;
  rccm: string | null;
  capitalSocial: string | null;
  telephone: string;
  telephoneSecondaire: string | null;
  email: string | null;
  adresse: string | null;
  quartier: string | null;
  ville: string | null;
  profession: string | null;
  employeur: string | null;
  secteurActivite: string | null;
  revenuMensuel: string | null;
  situationFamiliale: SituationFamiliale | null;
  nombreEnfants: number | null;
  referentNom: string | null;
  referentTelephone: string | null;
  referentRelation: string | null;
  statut: StatutProspect;
  produitInteretId: number | null;
  produitInteret?: { id: number; nom: string } | null;
  commercialId: number | null;
  notes: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  createdAt: string;
}

export interface Produit {
  id: number;
  nom: string;
  actif?: boolean;
}

export interface Client {
  id: number;
  typePersonne: TypePersonne;
  nom: string;
  prenom: string | null;
  genre: Genre | null;
  dateNaissance: string | null;
  lieuNaissance: string | null;
  nationalite: string | null;
  numeroCni: string | null;
  nui: string | null;
  sigle: string | null;
  formeJuridique: string | null;
  rccm: string | null;
  capitalSocial: string | null;
  telephone: string;
  telephoneSecondaire: string | null;
  email: string | null;
  adresse: string | null;
  quartier: string | null;
  ville: string | null;
  profession: string | null;
  employeur: string | null;
  secteurActivite: string | null;
  revenuMensuel: string | null;
  situationFamiliale: SituationFamiliale | null;
  nombreEnfants: number | null;
  referentNom: string | null;
  referentTelephone: string | null;
  referentRelation: string | null;
  statut: StatutClient;
  commercialId: number | null;
  notes: string | null;
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
