import type { UserRole } from '@/types/user';

export const APP_NAME = 'Cecaw Finance S.A';
export const APP_VERSION = '1.0.0';
export const APP_DESCRIPTION = 'Système de Gestion de la Relation Client - Cecaw Finance S.A';

export const CECAW_COORDINATES = {
  lat: 4.0511,
  lng: 9.7679,
  city: 'Douala, Cameroun',
  zoom: 12,
} as const;

export const PAGINATION_DEFAULTS = {
  page: 1,
  per_page: 20,
  per_page_options: [10, 20, 50, 100],
} as const;

export const TOKEN_KEYS = {
  access: 'cecaw_access_token',
  refresh: 'cecaw_refresh_token',
  user: 'cecaw_user',
} as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  // Backend roles
  admin:      'Administrateur',
  manager:    'Manager',
  backoffice: "Chef d'équipe",
  agent:      'Agent Terrain',
  // Legacy / display-only
  super_admin: 'Super Administrateur',
  directeur_general: 'Directeur Général',
  responsable_agence: "Responsable d'Agence",
  responsable_marketing: 'Responsable Marketing',
  analyste_credit: 'Analyste Crédit',
  superviseur_terrain: 'Superviseur Terrain',
  agent_terrain: 'Agent Terrain',
  auditeur: 'Auditeur',
  caissier: 'Caissier',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  // Backend roles
  admin:      'bg-purple-100 text-purple-700 border-purple-200',
  manager:    'bg-indigo-100 text-indigo-700 border-indigo-200',
  backoffice: 'bg-teal-100 text-teal-700 border-teal-200',
  agent:      'bg-green-100 text-green-700 border-green-200',
  // Legacy
  super_admin: 'bg-red-100 text-red-700 border-red-200',
  directeur_general: 'bg-blue-100 text-blue-700 border-blue-200',
  responsable_agence: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  responsable_marketing: 'bg-pink-100 text-pink-700 border-pink-200',
  analyste_credit: 'bg-amber-100 text-amber-700 border-amber-200',
  superviseur_terrain: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  agent_terrain: 'bg-green-100 text-green-700 border-green-200',
  auditeur: 'bg-gray-100 text-gray-700 border-gray-200',
  caissier: 'bg-teal-100 text-teal-700 border-teal-200',
};

export const CREDIT_STATUT_LABELS = {
  brouillon: 'Brouillon',
  en_attente: 'En attente',
  en_analyse: 'En analyse',
  en_comite: 'En comité',
  approuve: 'Approuvé',
  rejete: 'Rejeté',
  decaisse: 'Décaissé',
  en_cours: 'En cours',
  solde: 'Soldé',
  contentieux: 'Contentieux',
} as const;

export const CREDIT_STATUT_COLORS = {
  brouillon: 'bg-gray-100 text-gray-600',
  en_attente: 'bg-yellow-100 text-yellow-700',
  en_analyse: 'bg-blue-100 text-blue-700',
  en_comite: 'bg-purple-100 text-purple-700',
  approuve: 'bg-green-100 text-green-700',
  rejete: 'bg-red-100 text-red-700',
  decaisse: 'bg-teal-100 text-teal-700',
  en_cours: 'bg-indigo-100 text-indigo-700',
  solde: 'bg-gray-100 text-gray-600',
  contentieux: 'bg-red-200 text-red-800',
} as const;

export const CLIENT_STATUT_LABELS = {
  prospect: 'Prospect',
  actif: 'Actif',
  inactif: 'Inactif',
  archive: 'Archivé',
  blackliste: 'Blacklisté',
} as const;

export const PIPELINE_STATUT_LABELS = {
  nouveau: 'Nouveau',
  contacte: 'Contacté',
  interesse: 'Intéressé',
  negocie: 'Négocié',
  converti: 'Converti',
  perdu: 'Perdu',
} as const;

export const PIPELINE_COLORS = {
  nouveau: '#6366f1',
  contacte: '#3b82f6',
  interesse: '#f59e0b',
  negocie: '#8b5cf6',
  converti: '#10b981',
  perdu: '#ef4444',
} as const;

export const DEVISE = 'FCFA';
export const LOCALE = 'fr-CM';

export const MODULES_ROUTES = {
  dashboard: '/dashboard',
  users: '/dashboard/utilisateurs',
  clients: '/dashboard/clients',
  prospects: '/dashboard/prospects',
  credits: '/dashboard/credits',
  epargne: '/dashboard/epargne',
  produits: '/dashboard/produits',
  geolocation: '/dashboard/geolocalisation',
  objectifs: '/dashboard/objectifs',
  reporting: '/dashboard/reporting',
  notifications: '/dashboard/notifications',
  settings: '/dashboard/parametres',
  profile: '/dashboard/profil',
} as const;
