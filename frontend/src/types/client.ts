export type ClientStatut = 'prospect' | 'actif' | 'inactif' | 'archive' | 'blackliste';
export type ClientType = 'individuel' | 'groupe_solidaire' | 'pme';
export type PipelineStatut = 'nouveau' | 'contacte' | 'interesse' | 'negocie' | 'converti' | 'perdu';
export type Sexe = 'M' | 'F';
export type TypePiece = 'cni' | 'passeport' | 'permis' | 'carte_sejour';

export interface AdresseClient {
  quartier?: string;
  commune?: string;
  ville: string;
  pays: string;
  latitude?: number;
  longitude?: number;
}

export interface ActiviteEconomique {
  secteur: string;
  sous_secteur?: string;
  description?: string;
  revenu_mensuel_estime?: number;
  anciennete_activite?: number;
}

export interface Document {
  id: number;
  nom: string;
  type: string;
  url: string;
  taille?: number;
  uploaded_at: string;
}

export interface Client {
  id: number;
  code: string;
  nom: string;
  prenom: string;
  date_naissance?: string;
  lieu_naissance?: string;
  sexe?: Sexe;
  type_piece?: TypePiece;
  numero_piece?: string;
  telephone: string;
  telephone_secondaire?: string;
  email?: string;
  photo_url?: string;
  statut: ClientStatut;
  type: ClientType;
  adresse: AdresseClient;
  activite?: ActiviteEconomique;
  score_credit?: number;
  pipeline_statut?: PipelineStatut;
  agent_id?: number;
  agence_id: number;
  documents?: Document[];
  notes?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  // Relations calculées
  encours_credit?: number;
  total_epargne?: number;
  nb_credits?: number;
  historique_interactions?: Interaction[];
}

export interface Interaction {
  id: number;
  client_id: number;
  agent_id: number;
  type: 'appel' | 'visite' | 'email' | 'sms' | 'whatsapp' | 'reunion';
  statut: 'planifie' | 'realise' | 'annule';
  notes?: string;
  date_interaction: string;
  created_at: string;
}

export interface Prospect extends Client {
  source: 'terrain' | 'referral' | 'campagne' | 'digital' | 'autre';
  produit_interesse?: string;
  probabilite_conversion?: number;
  date_suivi_prevu?: string;
}

export interface CreateClientPayload {
  nom: string;
  prenom: string;
  date_naissance?: string;
  lieu_naissance?: string;
  sexe?: Sexe;
  type_piece?: TypePiece;
  numero_piece?: string;
  telephone: string;
  telephone_secondaire?: string;
  email?: string;
  statut?: ClientStatut;
  type: ClientType;
  adresse: AdresseClient;
  activite?: ActiviteEconomique;
  agent_id?: number;
  agence_id: number;
  notes?: string;
  tags?: string[];
}
