// Backend roles (4 real roles)
export type BackendRole = 'admin' | 'manager' | 'backoffice' | 'agent';

// Legacy roles kept for backwards-compat with existing UI code
export type UserRole =
  | BackendRole
  | 'super_admin'
  | 'directeur_general'
  | 'responsable_agence'
  | 'responsable_marketing'
  | 'analyste_credit'
  | 'superviseur_terrain'
  | 'agent_terrain'
  | 'auditeur'
  | 'caissier';

export type UserStatus = 'actif' | 'inactif' | 'suspendu' | 'en_attente';

export interface Permission {
  id: number;
  name: string;
  slug: string;
  module: string;
  description?: string;
}

export interface Role {
  id: number;
  name: string;
  slug: UserRole;
  permissions: Permission[];
  users_count?: number;
  description?: string;
  color?: string;
}

export interface Agence {
  id: number;
  code?: string;
  nom: string;
  adresse?: string;
  ville?: string;
  telephone?: string;
  email?: string;
  responsable_id?: number;
  latitude?: number;
  longitude?: number;
  est_active?: boolean;
  created_at?: string;
}

export interface Equipe {
  id: number;
  nom: string;
  agence_id?: number;
  agence?: Agence;
  superviseur_id?: number;
  membres?: User[];
  objectif_mensuel?: number;
  created_at?: string;
}

import type { Produit, GroupeProduit } from './produit';

/**
 * User shape as returned by the backend, with role normalised into an object
 * so existing UI code that reads user.role.slug keeps working.
 */
export interface User {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  photo_url?: string;
  /** Always an object with at minimum { slug }. Populated by mapBackendUser(). */
  role: Role;
  /** Derived from backend `actif` boolean */
  statut: UserStatus;
  /** Raw backend role string ('admin' | 'manager' | 'backoffice' | 'agent') */
  roleString?: BackendRole;
  fonction?: string | null;
  actif?: boolean;
  agence_id?: number;
  agence?: Agence;
  equipe_id?: number;
  equipe?: Equipe;
  derniere_connexion?: string;
  email_verified_at?: string;
  mfa_enabled?: boolean;
  created_at: string;
  updated_at?: string;
  full_name?: string;
  produits?: Produit[];
  produits_ids?: number[];
  groupes_produits?: GroupeProduit[];
  groupes_produits_ids?: number[];
}

export interface CreateUserPayload {
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  role: BackendRole;
  agence_id: number;
  equipe_id?: number;
  fonction?: string;
  actif?: boolean;
}

export interface UpdateUserPayload extends Partial<Omit<CreateUserPayload, 'role'>> {
  id: number;
  role?: BackendRole;
}
