export const CLASSES: Record<string, string> = {
  r1_30: '1 à 30 j', r31_60: '31 à 60 j', r61_90: '61 à 90 j', r91_180: '91 à 180 j', r180_plus: '> 180 j',
};

export const STATUTS: Record<string, { l: string; v: 'outline' | 'warning' | 'info' | 'destructive' | 'success' | 'secondary' }> = {
  ouvert: { l: 'Ouvert', v: 'outline' },
  en_relance: { l: 'En relance', v: 'warning' },
  promesse: { l: 'Promesse', v: 'info' },
  plan_regularisation: { l: 'Plan de régularisation', v: 'info' },
  precontentieux: { l: 'Précontentieux', v: 'destructive' },
  contentieux: { l: 'Contentieux', v: 'destructive' },
  regularise: { l: 'Régularisé', v: 'success' },
  irrecouvrable: { l: 'Irrécouvrable', v: 'secondary' },
};
