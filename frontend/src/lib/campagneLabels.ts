/** Libellés partagés du module Campagnes (Marketing & CRM). */

export const TYPE_CAMPAGNE: Record<string, string> = {
  acquisition: 'Acquisition',
  fidelisation: 'Fidélisation',
  reactivation: 'Réactivation',
  cross_selling: 'Vente croisée',
  notoriete: 'Notoriété',
  evenementiel: 'Événementiel',
  recouvrement: 'Recouvrement',
  autre: 'Autre',
};

export const STATUT_CAMPAGNE: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'outline' }> = {
  brouillon: { label: 'Brouillon', variant: 'warning' },
  en_cours: { label: 'En cours', variant: 'info' },
  terminee: { label: 'Terminée', variant: 'success' },
  annulee: { label: 'Annulée', variant: 'outline' },
};

export const CANAL_CAMPAGNE: Record<string, string> = { sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email' };

export const ROLE_MEMBRE: Record<string, string> = { responsable: 'Responsable', membre: 'Membre', observateur: 'Observateur' };

export const STATUT_CIBLE: Record<string, string> = {
  ciblee: 'Ciblée',
  mise_en_file: 'Message envoyé',
  en_attente_canal: 'En attente de canal',
  echec: 'Échec',
};
