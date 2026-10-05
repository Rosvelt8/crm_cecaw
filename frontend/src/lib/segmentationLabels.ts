/** Cycle de vie client (compléments stratégiques, point 1 ; étendu Lot 15 avec `perdu`/`a_reactiver`). */
export const CYCLE_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', actif: 'Actif', dormant: 'Dormant', a_risque: 'À risque', premium: 'Premium',
  perdu: 'Perdu', a_reactiver: 'À réactiver',
};
export const CYCLE_TONE: Record<string, 'info' | 'success' | 'warning' | 'destructive' | 'secondary' | 'brand'> = {
  nouveau: 'info', actif: 'success', dormant: 'warning', a_risque: 'destructive', premium: 'success',
  perdu: 'secondary', a_reactiver: 'brand',
};

/** Les 7 familles de score 360° (Lot 15), dans l'ordre d'affichage recommandé. */
export const SCORE_FAMILLES: { cle: string; label: string }[] = [
  { cle: 'score', label: 'Score client' },
  { cle: 'potentiel', label: 'Score commercial' },
  { cle: 'scoreCredit', label: 'Score crédit' },
  { cle: 'scoreRisque', label: 'Score risque' },
  { cle: 'scoreRelationnel', label: 'Score relationnel' },
  { cle: 'scoreStrategique', label: 'Score stratégique' },
  { cle: 'scoreCroissance', label: 'Customer Growth Score' },
];

export const TYPE_OPPORTUNITE_LABEL: Record<string, string> = { cross_sell: 'Vente complémentaire', up_sell: 'Palier supérieur' };
