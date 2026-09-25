import type { NiveauRisque, StatutKyc } from '@/services/kycService';

export const STATUT_KYC: Record<StatutKyc, { l: string; v: 'outline' | 'warning' | 'success' | 'destructive' | 'secondary' }> = {
  brouillon: { l: 'Brouillon', v: 'outline' },
  en_controle: { l: 'En contrôle', v: 'warning' },
  valide: { l: 'Validé', v: 'success' },
  rejete: { l: 'Rejeté', v: 'destructive' },
  archive: { l: 'Archivé', v: 'secondary' },
};

export const RISQUE: Record<NiveauRisque, { l: string; v: 'success' | 'warning' | 'destructive' }> = {
  faible: { l: 'Faible', v: 'success' },
  moyen: { l: 'Moyen', v: 'warning' },
  eleve: { l: 'Élevé', v: 'destructive' },
};
