/**
 * Moteur de calcul du canevas « Grille d'analyse » (compte d'exploitation + bilan).
 *
 * Fonctions pures : aucune dépendance à la base ni à Express, pour que les
 * formules restent testables et identiques entre l'API, l'aperçu en direct du
 * frontend et l'archive.
 *
 * Correspondance avec le canevas papier :
 *   (A)  Chiffre d'affaires retenu
 *   (B)  Total des dépenses de l'activité = achats + transport + charges fixes
 *   (C)  Cash flow = (A) − (B)
 *   (D)  Dépenses hors activité = loyer domicile + dépenses familiales et personnelles
 *   Capacité de remboursement = (C) − (D) − échéances en cours + autres revenus nets
 */

export type HypotheseRetenue = 'haute' | 'basse' | 'moyenne';

export interface EntreeGrille {
  caHypotheseHaute: number;
  caHypotheseBasse: number;
  hypotheseRetenue: HypotheseRetenue;

  achatsMarchandises: number;
  transportApprovisionnement: number;

  loyerLocal: number;
  impotsTaxes: number;
  salaires: number;
  eauElectricite: number;
  reparationsMaintenance: number;
  autresDepensesActivite: number;

  loyerDomicile: number;
  autresDepensesFamiliales: number;

  echeancesCecaw: number;
  echeancesAutresEmf: number;
  autresRevenusNets: number;

  /** Mensualité du crédit demandé, pour les ratios de décision. */
  mensualiteProposee?: number | null;
}

export interface ResultatGrille {
  caRetenu: number;
  margeBrute: number;
  tauxMarge: number;
  chargesFixes: number;
  totalDepenses: number;
  cashFlow: number;
  totalHorsActivite: number;
  echeancesEnCours: number;
  capaciteRemboursement: number;
  tauxCouverture: number | null;
  ratioEndettement: number | null;
  alertes: string[];
}

export interface EntreeBilan {
  localTerrain: number;
  equipement: number;
  stockMarchandises: number;
  creancesClients: number;
  liquidites: number;
  autresActifs: number;
  dettes: number;
}

export interface ResultatBilan {
  totalFondsCommerce: number;
  dettes: number;
  fondsPropres: number;
  totalPassif: number;
  alertes: string[];
}

/** Arrondi à deux décimales ; évite les dérives binaires (0,1 + 0,2). */
export const arrondi = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const positif = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};

export function choisirCa(haute: number, basse: number, hypothese: HypotheseRetenue): number {
  if (hypothese === 'haute') return haute;
  if (hypothese === 'moyenne') return arrondi((haute + basse) / 2);
  return basse;
}

export function calculerGrille(e: EntreeGrille): ResultatGrille {
  const alertes: string[] = [];

  const haute = positif(e.caHypotheseHaute);
  const basse = positif(e.caHypotheseBasse);
  if (basse > haute) alertes.push("L'hypothèse basse dépasse l'hypothèse haute.");

  const caRetenu = choisirCa(haute, basse, e.hypotheseRetenue);

  const achats = positif(e.achatsMarchandises);
  const transport = positif(e.transportApprovisionnement);
  const margeBrute = arrondi(caRetenu - achats - transport);
  const tauxMarge = caRetenu > 0 ? arrondi((margeBrute / caRetenu) * 100) : 0;
  if (caRetenu > 0 && margeBrute < 0) alertes.push('La marge brute est négative : les achats dépassent le chiffre d\'affaires retenu.');

  const chargesFixes = arrondi(
    positif(e.loyerLocal) + positif(e.impotsTaxes) + positif(e.salaires) +
    positif(e.eauElectricite) + positif(e.reparationsMaintenance) + positif(e.autresDepensesActivite),
  );

  const totalDepenses = arrondi(achats + transport + chargesFixes);
  const cashFlow = arrondi(caRetenu - totalDepenses);
  if (caRetenu > 0 && cashFlow < 0) alertes.push("Le cash flow de l'activité est négatif.");

  const totalHorsActivite = arrondi(positif(e.loyerDomicile) + positif(e.autresDepensesFamiliales));
  const echeancesEnCours = arrondi(positif(e.echeancesCecaw) + positif(e.echeancesAutresEmf));

  const capaciteRemboursement = arrondi(
    cashFlow - totalHorsActivite - echeancesEnCours + positif(e.autresRevenusNets),
  );
  if (capaciteRemboursement <= 0) alertes.push("La capacité de remboursement est nulle ou négative.");

  const mensualite = e.mensualiteProposee != null ? positif(e.mensualiteProposee) : null;
  let tauxCouverture: number | null = null;
  let ratioEndettement: number | null = null;
  if (mensualite !== null && mensualite > 0) {
    tauxCouverture = capaciteRemboursement > 0 ? arrondi(capaciteRemboursement / mensualite) : 0;
    ratioEndettement = capaciteRemboursement > 0 ? arrondi((mensualite / capaciteRemboursement) * 100) : null;
    if (capaciteRemboursement > 0 && mensualite > capaciteRemboursement) {
      alertes.push("La mensualité proposée dépasse la capacité de remboursement.");
    }
  }

  return {
    caRetenu, margeBrute, tauxMarge, chargesFixes, totalDepenses, cashFlow,
    totalHorsActivite, echeancesEnCours, capaciteRemboursement,
    tauxCouverture, ratioEndettement, alertes,
  };
}

export function calculerBilan(e: EntreeBilan): ResultatBilan {
  const alertes: string[] = [];
  const totalFondsCommerce = arrondi(
    positif(e.localTerrain) + positif(e.equipement) + positif(e.stockMarchandises) +
    positif(e.creancesClients) + positif(e.liquidites) + positif(e.autresActifs),
  );
  const dettes = positif(e.dettes);
  // Fonds propres = total actif − dettes, comme l'indique le canevas. Le passif
  // vaut donc toujours le total actif : l'équilibre est garanti par construction.
  const fondsPropres = arrondi(totalFondsCommerce - dettes);
  const totalPassif = arrondi(dettes + fondsPropres);

  if (fondsPropres < 0) alertes.push('Les fonds propres sont négatifs : les dettes dépassent les actifs professionnels.');
  if (totalFondsCommerce > 0 && dettes / totalFondsCommerce > 0.7) {
    alertes.push("L'endettement dépasse 70 % des actifs professionnels.");
  }

  return { totalFondsCommerce, dettes, fondsPropres, totalPassif, alertes };
}
