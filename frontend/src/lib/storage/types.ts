// ─── Fichiers ────────────────────────────────────────────────────────────────

export interface PieceJointe {
  id: string;
  intitule: string;
  nom: string;
  type: string;
  taille: number;
  data: string; // base64 data URL
}

// ─── Primitives ──────────────────────────────────────────────────────────────

export type Role = 'admin' | 'manager' | 'backoffice' | 'agent';
export type StatutProspect = 'nouveau' | 'contacte' | 'interesse' | 'negocie' | 'converti' | 'perdu';
export type StatutClient = 'actif' | 'inactif' | 'blackliste';
export type StatutCompte = 'actif' | 'suspendu' | 'clos';
export type TypeTransaction = 'credit' | 'debit';
export type UniteObjectif = 'clients' | 'montant';
export type PeriodiciteObjectif = 'semaine' | 'mois' | 'trimestre';
export type StatutObjectif = 'en_cours' | 'atteint' | 'depasse' | 'echec';
export type AssignationObjectif = 'equipe' | 'agents';
export type ModuleLog = 'marketing' | 'collecte' | 'parametres' | 'system';

// ─── Paramètres ──────────────────────────────────────────────────────────────

export interface GroupeProduit {
  id: string;
  nom: string;
  description: string;
  couleur: string;
  createdAt: string;
}

export interface Produit {
  id: string;
  nom: string;
  groupeId: string;
  description: string;
  actif: boolean;
  createdAt: string;
}

export interface Agence {
  id: string;
  nom: string;
  ville: string;
  adresse: string;
  actif: boolean;
  createdAt: string;
}

export interface Equipe {
  id: string;
  nom: string;
  agenceId: string;
  responsableId: string;
  createdAt: string;
}

export interface Utilisateur {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  fonction?: string;
  agenceId: string;
  equipeId: string;
  actif: boolean;
  createdAt: string;
}

// ─── Terrain ─────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  utilisateurId: string;
  matricule: string;
  secteur: string;
  latitude: number | null;
  longitude: number | null;
  dernierePositionAt: string | null;
}

// ─── Marketing ───────────────────────────────────────────────────────────────

export type GenreProspect = 'M' | 'F' | '';
export type SituationFamiliale = 'celibataire' | 'marie' | 'divorce' | 'veuf' | '';
export type TypePersonne = 'physique' | 'morale';

export interface Prospect {
  id: string;
  // ── Identité ──
  nom: string;
  prenom: string;
  genre?: GenreProspect;
  dateNaissance?: string;
  lieuNaissance?: string;
  nationalite?: string;
  numeroCNI?: string;
  // ── Contact ──
  telephone: string;
  telephoneSecondaire?: string;
  email?: string;
  // ── Adresse ──
  adresse?: string;
  quartier?: string;
  ville?: string;
  // ── Situation professionnelle ──
  profession?: string;
  employeur?: string;
  secteurActivite?: string;
  revenuMensuel?: string;
  // ── Situation familiale ──
  situationFamiliale?: SituationFamiliale;
  nombreEnfants?: number;
  // ── Référent / garant ──
  referentNom?: string;
  referentTelephone?: string;
  referentRelation?: string;
  // ── CRM ──
  statut: StatutProspect;
  produitInteretId: string;
  commercialId: string;
  notes: string;
  // ── Localisation ──
  latitude?: number | null;
  longitude?: number | null;
  // ── Pièces jointes ──
  piecesJointes?: PieceJointe[];
  // ── Système ──
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  prospectId: string | null;
  // ── Identité ──
  nom: string;
  prenom: string;
  genre?: GenreProspect;
  dateNaissance?: string;
  lieuNaissance?: string;
  nationalite?: string;
  numeroCNI?: string;
  // ── Contact ──
  telephone: string;
  telephoneSecondaire?: string;
  email: string;
  // ── Adresse ──
  adresse: string;
  quartier?: string;
  ville?: string;
  // ── Situation professionnelle ──
  profession?: string;
  employeur?: string;
  secteurActivite?: string;
  revenuMensuel?: string;
  // ── Situation familiale ──
  situationFamiliale?: SituationFamiliale;
  nombreEnfants?: number;
  // ── Référent ──
  referentNom?: string;
  referentTelephone?: string;
  referentRelation?: string;
  // ── Localisation ──
  latitude?: number | null;
  longitude?: number | null;
  // ── Pièces jointes ──
  piecesJointes?: PieceJointe[];
  // ── CRM ──
  agenceId: string;
  commercialId: string;
  statut: StatutClient;
  notes?: string;
  createdAt: string;
}

export interface CompteClient {
  id: string;
  numero: string;
  clientId: string;
  produitId: string;
  solde: number;
  statut: StatutCompte;
  dateOuverture: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  compteId: string;
  type: TypeTransaction;
  montant: number;
  soldeAvant: number;
  soldeApres: number;
  motif: string;
  agentId: string;
  createdAt: string;
}

// ─── Collecte ────────────────────────────────────────────────────────────────

export interface Objectif {
  id: string;
  titre: string;
  produitId: string;
  cible: number;
  unite: UniteObjectif;
  periodicite: PeriodiciteObjectif;
  dateDebut: string;
  dateFin: string;
  /** Attribution : soit une équipe entière, soit une liste d'agents nommément */
  assignationType: AssignationObjectif;
  equipeId: string | null;
  agentIds: string[];
  realise: number;
  statut: StatutObjectif;
  createdAt: string;
  createdById: string;
}

// ─── Logs ────────────────────────────────────────────────────────────────────

export interface Log {
  id: string;
  timestamp: string;
  utilisateurId: string;
  utilisateurLabel: string;
  agenceId: string;
  module: ModuleLog;
  action: string;
  entiteType: string;
  entiteId: string;
  description: string;
  impact: string;
}
