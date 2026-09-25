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

